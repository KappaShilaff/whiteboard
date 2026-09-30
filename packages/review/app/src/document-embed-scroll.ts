import {
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useRef,
} from "react";

/**
 * The reader's `review.codePeeks.scrollWithWheel` setting. On, a vertical
 * wheel over a code peek that can scroll stays with the peek, and stops at the
 * peek's edge instead of scrolling the document. A peek that fits leaves the
 * wheel to the document.
 */
export const CodePeekWheelScrollContext = createContext(false);

export interface DocumentEmbedScrollOptions {
  /** Read on every wheel event, so a settings change applies without rebinding. */
  codePeekWheelScroll?: () => boolean;
}

/** Ordinary vertical wheel gestures belong to the document, even when an
 * embedded native editor handles wheel input. Other gestures stay with embeds.
 * With the code peek setting on, a scrollable code peek keeps the wheel. */
export function useDocumentEmbedScroll(
  regionRef: RefObject<HTMLElement | null>,
) {
  const codePeekWheelScroll = useContext(CodePeekWheelScrollContext);
  const codePeekWheelScrollRef = useRef(codePeekWheelScroll);

  useEffect(() => {
    codePeekWheelScrollRef.current = codePeekWheelScroll;
  }, [codePeekWheelScroll]);

  useEffect(() => {
    const region = regionRef.current;

    if (!region) return;

    return routeDocumentEmbedScroll(region, {
      codePeekWheelScroll: () => codePeekWheelScrollRef.current,
    });
  }, [regionRef]);
}

export function routeDocumentEmbedScroll(
  region: HTMLElement,
  options: DocumentEmbedScrollOptions = {},
) {
  // Gestures handed to a Monaco peek. Monaco scrolls in script and animates,
  // so near an edge it can let an event through unconsumed; the browser would
  // then scroll the document with it. These are cancelled once they bubble back.
  const peekOwned = new WeakSet<WheelEvent>();

  const onWheel = (event: WheelEvent) => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.deltaY === 0 ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
      !(event.target instanceof Element)
    )
      return;

    const embed = event.target.closest(
      ".sequence-diagram, .flow-diagram, .database-lens, .code-peek",
    );

    if (!embed?.closest(".review-document") || !region.contains(embed)) return;

    if (
      embed.classList.contains("code-peek") &&
      options.codePeekWheelScroll?.()
    ) {
      const room = scrollRoomWithin(event.target, embed, event.deltaY);

      // With room the peek scrolls itself (Monaco or native overflow).
      if (room === "room" || room === "monaco-room") {
        if (room === "monaco-room") peekOwned.add(event);

        return;
      }

      // At the edge the gesture ends in the peek rather than moving the page.
      if (room === "edge") {
        event.preventDefault();
        event.stopPropagation();

        return;
      }
    }

    // Capture vertical gestures before React Flow/Monaco or native overflow can
    // consume them. Leave horizontal and modified gestures to the embed.
    event.preventDefault();
    event.stopPropagation();
    const lineHeight = parseFloat(getComputedStyle(region).lineHeight) || 20;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? lineHeight : 1;
    region.scrollBy({
      top:
        event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? region.clientHeight
          : unit),
      behavior: "instant",
    });
  };

  const onWheelBubble = (event: WheelEvent) => {
    if (peekOwned.has(event)) event.preventDefault();
  };

  region.addEventListener("wheel", onWheel, { capture: true, passive: false });
  region.addEventListener("wheel", onWheelBubble, { passive: false });

  return () => {
    region.removeEventListener("wheel", onWheel, { capture: true });
    region.removeEventListener("wheel", onWheelBubble);
  };
}

/**
 * How the vertical scrollers between `target` and `embed` can take the wheel:
 * `monaco-room` or `room` when a Monaco or a native scroller can still move in
 * the wheel's direction, `edge` when they scroll but are all at that edge,
 * `none` when nothing there scrolls.
 * Monaco scrolls virtually, so its extent is read from its vertical scrollbar
 * slider; anything else is native overflow.
 */
function scrollRoomWithin(
  target: Element,
  embed: Element,
  deltaY: number,
): "monaco-room" | "room" | "edge" | "none" {
  let atEdge = false;

  for (
    let element: Element | null = target;
    element && element !== embed.parentElement;
    element = element.parentElement
  ) {
    const extent = verticalExtent(element);

    if (!extent) continue;

    const canMove = deltaY > 0 ? extent.after > 0.5 : extent.before > 0.5;

    if (canMove)
      return element.classList.contains("monaco-scrollable-element")
        ? "monaco-room"
        : "room";

    atEdge = true;
  }

  return atEdge ? "edge" : "none";
}

/** Scroll distance left before and after the current position, or null. */
function verticalExtent(
  element: Element,
): { before: number; after: number } | null {
  if (element.classList.contains("monaco-scrollable-element")) {
    const track = element.querySelector(":scope > .scrollbar.vertical");
    const slider = track?.querySelector(":scope > .slider");

    if (!track || !slider) return null;

    const trackBox = track.getBoundingClientRect();
    const sliderBox = slider.getBoundingClientRect();

    if (sliderBox.height >= trackBox.height - 0.5) return null;

    return {
      before: sliderBox.top - trackBox.top,
      after: trackBox.bottom - sliderBox.bottom,
    };
  }

  if (!(element instanceof HTMLElement)) return null;

  const overflowY = getComputedStyle(element).overflowY;

  if (
    (overflowY !== "auto" && overflowY !== "scroll") ||
    element.scrollHeight <= element.clientHeight + 1
  )
    return null;

  return {
    before: element.scrollTop,
    after: element.scrollHeight - element.clientHeight - element.scrollTop,
  };
}
