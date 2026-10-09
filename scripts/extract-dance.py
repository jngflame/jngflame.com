"""Extract the front-center dancer locally; no video is uploaded.

Dependencies: see dance-requirements.txt.
Run with --help for the input video, official MediaPipe model and output paths.
"""

import argparse
import json
import time
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter1d


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--seconds", type=float, default=0)
    parser.add_argument("--fps", type=float, default=30)
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    video = cv2.VideoCapture(args.video)
    if not video.isOpened():
        raise RuntimeError("Cannot open input video")
    source_fps = video.get(cv2.CAP_PROP_FPS)
    count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if not np.isfinite(args.fps) or args.fps <= 0:
        raise ValueError("--fps must be positive and finite")
    stride = max(1, round(source_fps / args.fps))
    fps = source_fps / stride
    limit = min(count, round(args.seconds * source_fps)) if args.seconds else count
    # Keep the full camera frame: cropping changes the detector's aspect ratio
    # and caused it to miss the taller foreground dancer in this source.
    x0, x1 = 0, width
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=args.model),
        # Re-detect each sampled image. VIDEO mode in MediaPipe 1.1.0 dropped
        # this foreground subject while keeping the smaller background people.
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_poses=8,
        min_pose_detection_confidence=0.3,
        min_pose_presence_confidence=0.3,
        min_tracking_confidence=0.5,
    )
    worlds, images, confidences, times = [], [], [], []
    previous = None
    previews = []
    preview_times = [0, 15, 45, 90, 135, 180, 225, 244]
    start = time.monotonic()
    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
        for frame_index in range(limit):
            ok, frame = video.read()
            if not ok:
                raise RuntimeError(f"Video ended unexpectedly at frame {frame_index}")
            if frame_index % stride:
                continue
            seconds = frame_index / source_fps
            # The source cuts off her toes. Extra canvas below the image lets
            # the detector form a full-person ROI instead of choosing a smaller
            # background dancer whose feet are visible.
            padded = cv2.copyMakeBorder(frame[:, x0:x1], 0, round(height * 0.27), 0, 0, cv2.BORDER_CONSTANT)
            rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
            result = detector.detect(
                mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb),
            )
            candidates = []
            for pose, world in zip(result.pose_landmarks, result.pose_world_landmarks):
                points = np.array([[p.x, p.y, p.z] for p in pose])
                points[:, 0] = (points[:, 0] * (x1 - x0) + x0) / width
                points[:, 1] *= padded.shape[0] / height
                shoulder = points[[11, 12], :2].mean(axis=0)
                hip = points[[23, 24], :2].mean(axis=0)
                torso = np.linalg.norm(shoulder - hip)
                # Her ochre top distinguishes her from the green-shirted man
                # and denim-clad background dancer when their bodies overlap.
                chest = shoulder * 0.6 + hip * 0.4
                cx, cy = (chest * [width, height]).astype(int)
                patch = frame[max(0, cy - 4):cy + 5, max(0, cx - 4):cx + 5]
                hue = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)[:, :, 0].mean() if patch.size else 90
                appearance = min(abs(hue - 15) / 70, 1)
                score = 2 * abs(hip[0] - 0.51) + abs(shoulder[1] - 0.37) + appearance * 0.35
                if previous is not None:
                    score += 4 * np.linalg.norm(hip - previous[0])
                    score += 2 * np.linalg.norm(shoulder - previous[1])
                    score += abs(torso - previous[2])
                visibility = np.array([p.visibility for p in pose])
                candidates.append((score, points, world, visibility, hip, shoulder, torso))
            selected = min(candidates, key=lambda p: p[0]) if candidates else None
            # Reject a jump to a distant background person; bridge gaps later.
            if selected and previous is not None:
                if np.linalg.norm(selected[4] - previous[0]) > 0.18:
                    selected = None
            if selected:
                _, points, world, visibility, hip, shoulder, torso = selected
                previous = (hip, shoulder, torso)
                worlds.append([[p.x, -p.y, -p.z] for p in world])
                images.append(points)
                confidences.append(visibility)
            else:
                worlds.append(np.full((33, 3), np.nan))
                images.append(np.full((33, 3), np.nan))
                confidences.append(np.zeros(33))
            times.append(seconds)
            if preview_times and seconds >= preview_times[0]:
                preview_times.pop(0)
                preview = frame.copy()
                if selected:
                    for a, b in [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28)]:
                        p1, p2 = (points[[a, b], :2] * [width, height]).astype(int)
                        cv2.line(preview, tuple(p1), tuple(p2), (0, 255, 255), 2)
                previews.append((seconds, preview))
                cv2.imwrite(str(output / f"tracking-{round(seconds)}.jpg"), preview)
            if len(times) % 150 == 0:
                print(json.dumps({"seconds":round(seconds, 1), "total":round(limit/source_fps, 1), "elapsed":round(time.monotonic()-start, 1)}), flush=True)
    video.release()
    raw = np.asarray(worlds)
    normalized = np.asarray(images)
    confidence = np.asarray(confidences)
    missing = np.isnan(raw[:, 0, 0])
    if missing.mean() > 0.1:
        raise RuntimeError(f"Too many missing poses: {missing.mean():.1%}")
    # Low-visibility joints are interpolated rather than copying sudden spikes.
    for joint in range(33):
        valid = (~missing) & (confidence[:, joint] > 0.35)
        if not valid.any():
            valid = ~missing
        for axis in range(3):
            raw[:, joint, axis] = np.interp(times, np.asarray(times)[valid], raw[valid, joint, axis])
            normalized[:, joint, axis] = np.interp(times, np.asarray(times)[valid], normalized[valid, joint, axis])
    smoothed = gaussian_filter1d(raw, sigma=0.05 * fps, axis=0)
    # End at the exact source duration, preserving the whole song timeline.
    duration = limit / source_fps
    times.append(duration)
    smoothed = np.concatenate([smoothed, smoothed[-1:]])
    normalized = np.concatenate([normalized, normalized[-1:]])
    np.savez_compressed(output / "poses.npz", times=times, world=smoothed, image=normalized)
    (output / "poses.json").write_text(json.dumps({"times":times,"world":smoothed.round(5).tolist(),"image":normalized.round(5).tolist()}, separators=(",", ":")))
    report = {"sourceFrames":count,"sourceFps":source_fps,"duration":duration,"sampleFps":fps,"samples":len(times),"missingPoseRatio":float(missing.mean()),"meanJointVisibility":float(confidence.mean()),"method":"MediaPipe heavy, front-center appearance and temporal tracking; monocular estimated depth; no finger capture"}
    (output / "report.json").write_text(json.dumps(report, indent=2))
    sheet = Image.new("RGB", (width * 2, height * ((len(previews) + 1) // 2)))
    draw = ImageDraw.Draw(sheet)
    for i, (seconds, frame) in enumerate(previews):
        xy = ((i % 2) * width, (i // 2) * height)
        sheet.paste(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)), xy)
        draw.text((xy[0] + 8, xy[1] + 8), f"{seconds:.1f}s", fill="yellow")
    sheet.save(output / "tracking-preview.jpg")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
