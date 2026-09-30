import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { routeDocumentEmbedScroll } from "./document-embed-scroll";

let dispose: (() => void) | undefined;

afterEach(() => dispose?.());

function mount(
  embedClass: string,
  inDocument = true,
  codePeekWheelScroll = false,
) {
  const region = document.createElement("section");
  region.style.cssText =
    "width:300px;height:200px;overflow:auto;line-height:20px";
  region.innerHTML = `<article class="${inDocument ? "review-document" : "diagram-tour-stage"}" style="height:2000px;width:700px">
    <div class="${embedClass}" style="width:200px;height:100px;overflow:auto">
      <div style="height:600px;width:900px">Content</div>
    </div>
  </article>`;
  document.body.append(region);
  dispose = routeDocumentEmbedScroll(region, {
    codePeekWheelScroll: () => codePeekWheelScroll,
  });
  const embed = region.querySelector<HTMLElement>(`.${embedClass}`)!;
  const content = embed.firstElementChild!;

  return { region, embed, content };
}

it.each(["sequence-diagram", "flow-diagram", "database-lens", "code-peek"])(
  "scrolls the document vertically over %s without scrolling the embed",
  (embedClass) => {
    const { region, embed, content } = mount(embedClass);
    const embeddedWheel = vi.fn<(event: WheelEvent) => void>();
    embed.addEventListener("wheel", embeddedWheel);
    region.scrollTop = 300;
    embed.scrollTop = 50;
    embed.scrollLeft = 60;

    content.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 120,
        deltaX: 30,
      }),
    );
    expect(region.scrollTop).toBe(420);
    expect(region.scrollLeft).toBe(0);
    content.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -80 }),
    );
    expect(region.scrollTop).toBe(340);
    expect(embed.scrollTop).toBe(50);
    expect(embed.scrollLeft).toBe(60);
    expect(embeddedWheel).not.toHaveBeenCalled();
  },
);

it.each(["sequence-diagram", "flow-diagram", "database-lens", "code-peek"])(
  "leaves horizontal gestures over %s to the embed",
  (embedClass) => {
    const { region, embed, content } = mount(embedClass);
    const embeddedWheel = vi.fn<(event: WheelEvent) => void>();
    embed.addEventListener("wheel", embeddedWheel);

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 120,
      deltaY: 20,
    });

    content.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
    expect(embeddedWheel).toHaveBeenCalledOnce();
    expect(region.scrollTop).toBe(0);
  },
);

it("routes a diagonal tie to the document, not the code peek", () => {
  const { region, embed, content } = mount("code-peek");
  const embeddedWheel = vi.fn<(event: WheelEvent) => void>();
  embed.addEventListener("wheel", embeddedWheel);
  region.scrollTop = 300;
  embed.scrollTop = 50;

  content.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 1,
      deltaY: 1,
    }),
  );

  expect(region.scrollTop).toBe(301);
  expect(embed.scrollTop).toBe(50);
  expect(embeddedWheel).not.toHaveBeenCalled();
});

it("scrolls a wide sequence diagram horizontally with a trackpad gesture", async () => {
  const { region, embed, content } = mount("sequence-diagram");

  await userEvent.wheel(content, { delta: { x: 120, y: 0 } });

  await vi.waitFor(() => expect(embed.scrollLeft).toBeGreaterThan(0));
  expect(region.scrollTop).toBe(0);
});

it.each([
  ["Shift-wheel", { shiftKey: true }],
  ["Cmd-wheel", { metaKey: true }],
  ["Ctrl-wheel", { ctrlKey: true }],
])("leaves %s to the embed", (_name, modifiers) => {
  const { region, embed, content } = mount("sequence-diagram");
  const embeddedWheel = vi.fn<(event: WheelEvent) => void>();
  embed.addEventListener("wheel", embeddedWheel);

  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
    ...modifiers,
  });

  content.dispatchEvent(wheel);

  expect(wheel.defaultPrevented).toBe(false);
  expect(embeddedWheel).toHaveBeenCalledOnce();
  expect(region.scrollTop).toBe(0);
});

it("normalizes line and page wheel deltas", () => {
  const { region, content } = mount("code-peek");
  content.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 3,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
    }),
  );
  expect(region.scrollTop).toBe(60);
  content.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 1,
      deltaMode: WheelEvent.DOM_DELTA_PAGE,
    }),
  );
  expect(region.scrollTop).toBe(60 + region.clientHeight);
});

it("leaves fullscreen tours and pinch-to-zoom alone", () => {
  const { region, content } = mount("sequence-diagram", false);

  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
  });

  content.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  expect(region.scrollTop).toBe(0);
  region.firstElementChild!.className = "review-document";

  const pinch = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
    ctrlKey: true,
  });

  content.dispatchEvent(pinch);
  expect(pinch.defaultPrevented).toBe(false);
  expect(region.scrollTop).toBe(0);
});

it("continues scrolling the document when the embed fits and removes the handler on cleanup", () => {
  const { region, embed, content } = mount("sequence-diagram");
  (content as HTMLElement).style.cssText = "height:20px;width:20px";
  expect(embed.scrollHeight).toBe(embed.clientHeight);
  content.dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 }),
  );
  expect(region.scrollTop).toBe(80);
  dispose?.();

  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
  });

  content.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  expect(region.scrollTop).toBe(80);
});

it("lets a code peek scroll itself while it has room when the setting is on", () => {
  const { region, embed, content } = mount("code-peek", true, true);
  const embeddedWheel = vi.fn<(event: WheelEvent) => void>();
  embed.addEventListener("wheel", embeddedWheel);
  embed.scrollTop = 50;

  for (const deltaY of [120, -80]) {
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY,
    });

    content.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
  }

  expect(embeddedWheel).toHaveBeenCalledTimes(2);
  expect(region.scrollTop).toBe(0);
});

it("stops the wheel at a code peek's edge instead of scrolling the document", () => {
  const { region, embed, content } = mount("code-peek", true, true);
  region.scrollTop = 300;
  embed.scrollTop = embed.scrollHeight - embed.clientHeight;

  const down = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  });

  content.dispatchEvent(down);

  expect(down.defaultPrevented).toBe(true);
  expect(region.scrollTop).toBe(300);

  embed.scrollTop = 0;

  const up = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -80,
  });

  content.dispatchEvent(up);

  expect(up.defaultPrevented).toBe(true);
  expect(region.scrollTop).toBe(300);
});

it("scrolls the document over a code peek that fits, with the setting on", () => {
  const { region, content } = mount("code-peek", true, true);
  (content as HTMLElement).style.height = "50px";
  region.scrollTop = 300;

  content.dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 }),
  );

  expect(region.scrollTop).toBe(420);
});

it.each(["sequence-diagram", "flow-diagram", "database-lens"])(
  "keeps scrolling the document over %s when the code peek setting is on",
  (embedClass) => {
    const { region, embed, content } = mount(embedClass, true, true);
    region.scrollTop = 300;
    embed.scrollTop = 50;

    content.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 }),
    );

    expect(region.scrollTop).toBe(420);
    expect(embed.scrollTop).toBe(50);
  },
);

it("cancels the browser's own scroll for a gesture a Monaco peek let through", () => {
  const region = document.createElement("section");
  region.style.cssText = "width:300px;height:200px;overflow:auto";
  region.innerHTML = `<article class="review-document" style="height:2000px">
    <div class="code-peek">
      <div class="monaco-scrollable-element" style="position:relative;height:100px">
        <div class="scrollbar vertical" style="position:absolute;top:0;right:0;width:10px;height:100px">
          <div class="slider" style="position:absolute;top:40px;height:20px;width:10px"></div>
        </div>
        <div class="line">code</div>
      </div>
    </div>
  </article>`;
  document.body.append(region);
  dispose = routeDocumentEmbedScroll(region, {
    codePeekWheelScroll: () => true,
  });
  const line = region.querySelector(".line")!;

  // Monaco neither consumes nor stops this one, as happens mid-animation at an edge.
  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  });

  line.dispatchEvent(wheel);

  expect(wheel.defaultPrevented).toBe(true);
  expect(region.scrollTop).toBe(0);
  region.remove();
});
