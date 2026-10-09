import type { AnchorHTMLAttributes } from "react";

export const linkStyle = "transition-opacity hover:opacity-60";
export let isLinkNavigation = false;

export function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
}) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        const next = new URL(href, window.location.origin);
        isLinkNavigation = true;
        window.history.pushState(null, "", next.pathname + next.hash);
        window.dispatchEvent(new PopStateEvent("popstate"));
        requestAnimationFrame(() => {
          isLinkNavigation = false;
          const behavior = "smooth";
          if (next.hash)
            document
              .getElementById(next.hash.slice(1))
              ?.scrollIntoView({ behavior });
          else window.scrollTo({ top: 0, behavior });
        });
      }}
    />
  );
}
