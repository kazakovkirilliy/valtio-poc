# Architecture overview videos

Three silent MP4 videos explain the implemented or benchmarked approaches. Each shows the data flow, advantages, disadvantages, and selection criteria. English captions are burned into the video; SRT and WebVTT files are included separately.

| Approach | Duration | Video | Captions |
| --- | --- | --- | --- |
| Corrected Valtio with product-scoped proxies | 1:12 | [Watch/download](01-valtio.mp4) | [SRT](01-valtio.srt) |
| Zustand workspace selectors and product stores | 1:12 | [Watch/download](02-zustand.mp4) | [SRT](02-zustand.srt) |
| Jotai drafts alongside Apollo | 1:23 | [Watch/download](03-jotai-apollo.mp4) | [SRT](03-jotai-apollo.srt) |

With `pnpm dev` running, open `/docs/videos/index.html` for a gallery with native video controls. Production builds include the same gallery at `/videos/index.html`. The animations illustrate the data flow. Jotai/Apollo is the application implementation; Valtio and Zustand are the corrected candidates exercised in the subscription benchmark.

All variants preserve the original deal-and-products presentation. Store partitioning, canonical shared fields, explicit bulk commands, lifecycle cleanup, and virtualization remain necessary across the alternatives. Apollo owns remote entities in the proposed architectures.

Benchmark numbers come from [the recorded results](../../benchmarks/results.json) and [the reproducible fixture](../../benchmarks/stores.ts). They measure scalar subscriptions over 2,000 writes at 1,000 subscribers on Node 24.20.0. They do not compare initialization, allocation, network traffic, or browser interaction latency. The [decision record](../adr/0001-scoped-editor-state.md) contains the full comparison and limitations.

References: [Valtio snapshots](https://valtio.dev/docs/api/basic/useSnapshot), [Zustand scoped stores](https://zustand.docs.pmnd.rs/learn/guides/initialize-state-with-props), [Zustand selectors](https://zustand.docs.pmnd.rs/reference/middlewares/subscribe-with-selector), [Jotai stores](https://jotai.org/docs/core/store), [Jotai performance](https://jotai.org/docs/guides/performance), [Apollo subscriptions](https://www.apollographql.com/docs/react/data/subscriptions), and [React external-store subscriptions](https://react.dev/reference/react/useSyncExternalStore).

The [renderer](../../scripts/render_overviews.py) recreates the MP4s, posters, and timed captions using Pillow and ffmpeg. It uses macOS Arial fonts and requires Pillow in the selected Python runtime. This is an optional artifact-generation tool, separate from the app's build. [Verification metadata](verification.json) records duration, dimensions, H.264 encoding, and the absence of audio; all files were also fully decoded without errors.
