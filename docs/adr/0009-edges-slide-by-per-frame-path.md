# Edges slide by rewriting their path each frame

The **Move** has to slide every edge in step with the cards it joins. The macOS app renders in WKWebView (Electrobun's native renderer), which rules out both declarative ways to do that:

- **Animating `d` through Web Animations.** WebKit does not support `d` as a CSS property — `CSS.supports('d', 'path("M 0 0 L 1 1")')` is false — so the animation is silently dropped: lines snap to their new place while the cards slide, visibly detached. It only ever worked in Chromium, where the chart was usually debugged.
- **A transform on a unit segment** (`M 0 0 L 1 0`, stretched by `scale(length, 1)`). WebKit rasterizes a transform-animated element at its local size and stretches the result, so the anti-aliased ends of a one-unit segment smear into long fades that run past the endpoints.

Decision: an edge's path always carries its real geometry, and during a Move a `requestAnimationFrame` loop moves each sliding edge's points (a **Tie**'s ends; a **Sibship connector**'s Drop top, Bar height and Leg feet) from old to new and rebuilds its `d` from them — rounded corners included, so they stay round mid-slide rather than being stretched. Timing comes from a target-less Web Animation (a `KeyframeEffect` with no target) on the Move's own delay, duration and easing; each frame reads its eased `getComputedTiming().progress`. That is the same timeline and timing function the cards animate on, so lines and cards stay frame-for-frame together. Its `fill: 'both'` pins progress to 0 through the delay and 1 after the end.

The loop writes the attribute Lit also owns. When the Move ends or is cancelled, each path goes back to the value Lit rendered — unless Lit has since written a newer one, which it does only when the geometry changed, detected by the attribute no longer matching the last value the loop wrote. Cancellation is synchronous, so a superseding relayout's first frame never sees a stale path.

## Considered options

- **SMIL `<animate attributeName="d">`.** Supported by WebKit, but it lives outside Web Animations, so matching the cards' easing and cancelling a superseded Move would take a second timing mechanism.
- **Render the chart from state every frame.** Correct everywhere but re-renders every card for every frame of every Move.
- **Per-frame `d` driven by a Web Animation's progress (chosen).** Crisp in every engine, and the timing stays in the one place the cards already use.

## Consequences

- `rAF` must run for lines to move: in a hidden tab or an offscreen WKWebView lines hold their start positions until frames resume, and the loop then jumps them to the end. Nothing is painted in those states anyway.
- The driver is in the Move's `anims`, so the controller watches its `finished` alongside the cards'.
