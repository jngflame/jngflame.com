"""FreeMoCap single-camera capture with a separate foreground-person crop guide.

The guide only locates the subject; all output joints are freshly detected by
FreeMoCap's SkellyTracker, then processed by FreeMoCap's single-camera and
SkellyForge stages. No video is uploaded. See README.md for uv setup.
"""

import argparse
import hashlib
import json
import time
from concurrent.futures import ProcessPoolExecutor
from itertools import islice
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def initialize_tracker():
    global worker_tracker
    from skellytracker.trackers.mediapipe_tracker.mediapipe_holistic_tracker import (
        MediapipeHolisticTracker,
    )

    worker_tracker = MediapipeHolisticTracker(
        model_complexity=2,
        static_image_mode=True,
        min_detection_confidence=0.3,
        min_tracking_confidence=0.3,
    )


def track_crop(crop):
    objects = worker_tracker.process_image(crop)
    pose = objects["pose_landmarks"].extra["landmarks"]
    if not pose:
        return None
    result = {"body": np.array([[p.x, p.y, p.z, p.visibility] for p in pose.landmark])}
    for side in ["Left", "Right"]:
        hand = objects[f"{side.lower()}_hand_landmarks"].extra["landmarks"]
        result[side] = (
            np.array([[p.x, p.y, p.z] for p in hand.landmark]) if hand else None
        )
    return result


def tracked_frames(video, guide, width, height, stride, limit, source_fps, workers):
    guide_times = np.asarray(guide["times"])

    def frames():
        for frame_index in range(limit):
            ok, frame = video.read()
            if not ok:
                raise RuntimeError(f"Video ended at {frame_index}")
            if frame_index % stride:
                continue
            seconds = frame_index / source_fps
            guide_index = int(np.argmin(np.abs(guide_times - seconds)))
            expected = np.array(guide["image"][guide_index])[:, :2] * [width, height]
            margin = 45 * width / 640
            x0 = max(0, int(expected[:, 0].min() - margin))
            x1 = min(width, int(expected[:, 0].max() + margin))
            crop = cv2.copyMakeBorder(
                frame[:, x0:x1], 0, round(height * 0.27), 0, 0, cv2.BORDER_CONSTANT
            )
            yield seconds, frame, expected, x0, x1, crop

    source = frames()
    # Static-image tracking makes frames independent. Bound memory and process
    # batches in timestamp order, then filter the entire continuous timeline.
    with ProcessPoolExecutor(
        max_workers=workers, initializer=initialize_tracker
    ) as pool:
        while batch := list(islice(source, 45)):
            for item, pose in zip(
                batch, pool.map(track_crop, [item[-1] for item in batch])
            ):
                yield *item, pose


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument(
        "--guide",
        required=True,
        help="Subject-selection poses.json from extract-dance.py",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--seconds", type=float, default=0)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--fps", type=float, default=30)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    from freemocap import __version__
    from freemocap.core_processes.post_process_skeleton_data.post_process_skeleton import (
        post_process_data,
    )
    from freemocap.core_processes.post_process_skeleton_data.process_single_camera_skeleton_data import (
        process_single_camera_skeleton_data,
    )
    from freemocap.data_layer.recording_models.post_processing_parameter_models import (
        ProcessingParameterModel,
    )

    guide = json.loads(Path(args.guide).read_text())
    video = cv2.VideoCapture(args.video)
    if not video.isOpened():
        raise RuntimeError("Cannot open video")
    source_fps = video.get(cv2.CAP_PROP_FPS)
    count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    width, height = int(video.get(3)), int(video.get(4))
    pixel_scale = width / 640
    if not np.isfinite(args.fps) or args.fps <= 0:
        raise ValueError("--fps must be positive and finite")
    stride = max(1, round(source_fps / args.fps))
    fps = source_fps / stride
    limit = min(count, round(args.seconds * source_fps)) if args.seconds else count
    if args.workers < 1 or guide["times"][-1] + 1 / source_fps < limit / source_fps:
        raise ValueError(
            "Positive workers and a guide covering the whole video are required"
        )
    samples, confidence, times, previews = [], [], [], []
    hands = {"Left": [], "Right": []}
    preview_times = [0, 15, 45, 90, 135, 180, 225, 244]
    started = time.monotonic()
    for seconds, frame, expected, x0, x1, crop, pose in tracked_frames(
        video, guide, width, height, stride, limit, source_fps, args.workers
    ):
        # Dynamic horizontal crop follows the foreground subject, with generous
        # arm room and extra canvas below the source's cropped-off feet.
        points, visibility = np.full((33, 3), np.nan), np.zeros(33)
        if pose is not None:
            points = pose["body"][:, :3] * [x1 - x0, crop.shape[0], x1 - x0] + [
                x0,
                0,
                0,
            ]
            visibility = pose["body"][:, 3]
            # Reject another dancer if the detector jumps out of the guide's hips.
            if (
                np.linalg.norm(
                    points[[23, 24], :2].mean(0) - expected[[23, 24]].mean(0)
                )
                > width * 0.1
            ):
                points[:] = np.nan
                visibility[:] = 0
        hand_pixels = {}
        for side, wrist, elbow in [("Left", 15, 13), ("Right", 16, 14)]:
            hand = pose[side] if pose is not None else None
            accepted = None
            if hand is not None and visibility[wrist] >= 0.35:
                pixels = hand * [x1 - x0, crop.shape[0], x1 - x0] + [x0, 0, 0]
                wrist_error = np.linalg.norm(pixels[0, :2] - points[wrist, :2])
                forearm_length = np.linalg.norm(points[wrist, :2] - points[elbow, :2])
                palm_length = np.linalg.norm(pixels[9, :2] - pixels[0, :2])
                if wrist_error <= max(
                    20 * pixel_scale, 0.4 * forearm_length
                ) and 2 * pixel_scale < palm_length < max(
                    40 * pixel_scale, 0.8 * forearm_length
                ):
                    # Holistic hand Z is wrist-relative, unlike body Z. Export
                    # wrist-relative directions in the same camera axes as body.
                    accepted = (
                        ((pixels - pixels[0]) * [1, -1, -1] / width).round(6).tolist()
                    )
                    hand_pixels[side] = pixels
            hands[side].append(accepted)
        samples.append(points)
        confidence.append(visibility)
        times.append(seconds)
        if preview_times and seconds >= preview_times[0]:
            preview_times.pop(0)
            preview = frame.copy()
            for a, b in [
                (11, 12),
                (11, 13),
                (13, 15),
                (12, 14),
                (14, 16),
                (11, 23),
                (12, 24),
                (23, 24),
                (23, 25),
                (25, 27),
                (24, 26),
                (26, 28),
            ]:
                if np.isfinite(points[[a, b]]).all():
                    p1, p2 = points[[a, b], :2].astype(int)
                    cv2.line(preview, tuple(p1), tuple(p2), (0, 255, 255), 2)
            for pixels in hand_pixels.values():
                for base in [1, 5, 9, 13, 17]:
                    for a, b in [
                        (0, base),
                        (base, base + 1),
                        (base + 1, base + 2),
                        (base + 2, base + 3),
                    ]:
                        p1, p2 = pixels[[a, b], :2].astype(int)
                        cv2.line(preview, tuple(p1), tuple(p2), (0, 255, 0), 1)
            previews.append((seconds, preview))
            cv2.imwrite(str(output / f"tracking-{round(seconds)}.jpg"), preview)
        if len(times) % 150 == 0:
            print(
                json.dumps(
                    {
                        "seconds": round(seconds, 1),
                        "total": round(limit / source_fps, 1),
                        "elapsed": round(time.monotonic() - started, 1),
                    }
                ),
                flush=True,
            )
    video.release()
    raw = np.asarray(samples)
    visibility = np.asarray(confidence)
    missing = ~np.isfinite(raw[:, 0, 0])
    if missing.mean() > 0.1:
        raise RuntimeError(f"Too many missed foreground poses: {missing.mean():.1%}")
    # Mark unreliable joints before FreeMoCap's interpolation/filtering stage.
    raw[visibility < 0.35] = np.nan

    def longest_gap(mask):
        boundaries = np.diff(np.r_[False, mask, False].astype(int))
        return int(
            (np.flatnonzero(boundaries == -1) - np.flatnonzero(boundaries == 1)).max(
                initial=0
            )
        )

    pose_gap_seconds = longest_gap(missing) / fps
    joint_gap_seconds = (
        max(longest_gap(~np.isfinite(raw[:, joint, 0])) for joint in range(33)) / fps
    )
    if not np.isfinite(raw).any(axis=0).all():
        raise RuntimeError("A joint has no valid samples")
    np.save(output / "freemocap_body_2d.npy", raw[None])
    rotated, _ = process_single_camera_skeleton_data(
        raw, output / "raw_data", file_prefix="mediapipe_", project_to_z_plane=False
    )
    parameters = ProcessingParameterModel()
    parameters.post_processing_parameters_model.framerate = fps
    parameters.post_processing_parameters_model.butterworth_filter_parameters.sampling_rate = fps
    parameters.post_processing_parameters_model.butterworth_filter_parameters.cutoff_frequency = 4
    processed = post_process_data(parameters, rotated, queue=None)
    if processed is None or not np.isfinite(processed).all():
        raise RuntimeError("FreeMoCap post-processing left invalid body data")
    np.save(output / "freemocap_body_3d.npy", processed)
    # FreeMoCap: X right, Y inferred depth, Z up. Three.js: X right, Y up, Z back.
    world = processed[..., [0, 2, 1]] * [1, 1, -1]
    world -= world[:, [23, 24]].mean(axis=1)[:, None]
    world /= width
    image = processed[..., [0, 2, 1]] * [1, -1, 1] / [width, height, width]
    duration = limit / source_fps
    times.append(duration)
    world = np.concatenate([world, world[-1:]])
    image = np.concatenate([image, image[-1:]])
    hand_detection_ratios = {
        side: sum(hand is not None for hand in frames) / len(frames)
        for side, frames in hands.items()
    }
    for frames in hands.values():
        frames.append(frames[-1])
    method = f"FreeMoCap {__version__}: SkellyTracker Holistic heavy + single-camera non-flattened inferred depth + SkellyForge interpolation and 4Hz Butterworth; guide used for crop only"
    (output / "poses.json").write_text(
        json.dumps(
            {
                "times": times,
                "world": world.round(6).tolist(),
                "image": image.round(6).tolist(),
                "method": method,
                "hands": hands,
            },
            separators=(",", ":"),
        )
    )
    report = {
        "sourceSha256": hashlib.sha256(Path(args.video).read_bytes()).hexdigest(),
        "sourceFrames": count,
        "sourceWidth": width,
        "sourceHeight": height,
        "sourceFps": source_fps,
        "duration": duration,
        "sampleFps": fps,
        "samples": len(times),
        "missingPoseRatio": float(missing.mean()),
        "rejectedPoseFrames": int(missing.sum()),
        "lowConfidenceJointRatio": float((~np.isfinite(raw[:, :, 0])).mean()),
        "meanJointVisibility": float(visibility.mean()),
        "longestMissingPoseSeconds": pose_gap_seconds,
        "longestInterpolatedJointSeconds": joint_gap_seconds,
        "method": method,
        "depth": "Monocular relative-depth estimate, not calibrated multiview reconstruction",
        "fingerCapture": True,
        "handDetectionRatios": hand_detection_ratios,
        "handMissingPolicy": "Retargeting interpolates finger directions in palm coordinates between detections; nearest shape held at edges; neutral only if no valid hand exists",
    }
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    sheet = Image.new("RGB", (width * 2, height * ((len(previews) + 1) // 2)))
    draw = ImageDraw.Draw(sheet)
    for i, (seconds, preview) in enumerate(previews):
        xy = ((i % 2) * width, (i // 2) * height)
        sheet.paste(Image.fromarray(cv2.cvtColor(preview, cv2.COLOR_BGR2RGB)), xy)
        draw.text((xy[0] + 8, xy[1] + 8), f"FreeMoCap {seconds:.1f}s", fill="yellow")
    sheet.save(output / "tracking-preview.jpg")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
