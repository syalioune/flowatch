<!--
Status: DRAFT — post after v1.0.0 is tagged. Single-maintainer review.
Target: paste into BOTH Flowable forum threads (tailor the opening line per thread):
  - 12226: https://forum.flowable.org/t/flowable-ui-7-1-0-version-alternative/12226
  - 11896: https://forum.flowable.org/t/open-source-commitment-and-ui-features-in-flowable-7-x/11896
Confirm the "1.0" version literal matches the actual tag before posting.
The same body is intended for both threads — paste it twice; optionally adjust
only the first line to mirror each thread's exact question.
-->

# Flowatch — a community OSS browser GUI for Flowable 7+ OSS

Several of you in this thread have been asking the same thing: now that the web UI moved to the enterprise tier in Flowable 7.x, where is the OSS browser front-end for the engine + REST API? **Flowatch** is a community answer to exactly that gap.

👉 **See it / try it:** https://syalioune.github.io/flowatch/

Flowatch is a single-page browser GUI for Flowable 7+ OSS. It wraps the Flowable REST API and embeds the official `bpmn-js` / `dmn-js` modelers, so you can model, deploy, and operate processes from the browser — no curl. The benchmark is the legacy 6.x OSS UI: if a 6.x-OSS operator used to do it, Flowatch aims to do it.

## What it does (shipped today)

- **Model** BPMN and DMN in the embedded official modelers
- **Deploy** definitions to the engine
- **Watch** running process instances
- **Work** tasks (claim, complete, forms)
- **Inspect** jobs (executable / timer / dead-letter) and history
- **Manage** identity (users & groups)

All in the browser, talking only to the live engine — real state or an honest error, no mock fallback.

## Why you can trust it

- **Apache-2.0**, self-hosted, **no telemetry**, no SaaS lock-in
- **Tested vs Flowable 7.2.0** — see the compatibility matrix: https://github.com/syalioune/flowatch/blob/main/docs/compat.md
- Ships three coherent visual looks (editorial / terminal / industrial), light & dark

## Try it in 30 seconds

```bash
docker run --rm -p 5173:8080 ghcr.io/syalioune/flowatch:latest
# open http://localhost:5173 — set baseUrl in Settings to your Flowable instance
```

## Links

- **Landing page:** https://syalioune.github.io/flowatch/
- **GitHub:** https://github.com/syalioune/flowatch
- **Compatibility (Flowable 7.2.0 tested):** https://github.com/syalioune/flowatch/blob/main/docs/compat.md
- **License:** Apache-2.0

Flowatch is a community OSS project — **not affiliated with Flowable.com Ltd.** It's built for the people in these threads, so feedback, issues, and "does it do X?" questions are very welcome. If you've been waiting for an OSS UI for Flowable 7.x, give it a spin and tell me what's missing.
