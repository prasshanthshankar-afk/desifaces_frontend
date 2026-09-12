# desifaces V3 Mobile Physical-Device Acceptance — 2026-09-12

Release branch: `release/v3-production-web-mobile-parity-20260912`

This is the final manual gate before store submission. It does **not** authorize production/store cutover by itself.

## Preconditions

- Use a build produced from the release branch above.
- Automated production-parity and capability-parity workflows must be green on the tested commit.
- Test one physical iPhone and one physical Android device.
- Use the same non-production test account/story on both devices where practical.

## Required acceptance path on each device

1. Sign in and confirm the production app identity/branding is `desifaces.ai`.
2. Open Piku and verify a normal product/help response renders correctly, including lightweight bold text.
3. Use **Continue story** / **Continue where you left off** and confirm it opens the canonical Multi-Person Story route.
4. Open a saved/resumed Story and confirm Face media loads from durable media identity.
5. Confirm Audio from a resumed/historical Story plays with a real duration and does not show `0:00 / 0:00` for valid media.
6. Download/share one Audio output and confirm MP3 handling works without an expired-SAS/502 failure.
7. Continue through Face → Audio → Fusion and confirm the Story Final surface shows the final Fusion video rather than individual scene fragments.
8. Download/share one final MP4 and one generated image where available.
9. Open Saved Work / recent work and confirm the same Story/final-media behavior is visible there.
10. Open spending/history and confirm it is consistent with the shared backend account data; no client-local pricing calculation should appear.
11. Open billing/upgrade UI and confirm iOS uses Apple IAP and Android uses Google Play Billing. Mobile must not present Stripe checkout.
12. Sign out and sign back in; confirm Story discovery and durable media still resume correctly.

## Fail-closed acceptance record

Record `PASS` only when every required item passes on that platform.

| Gate | iOS | Android |
| --- | --- | --- |
| Authentication / brand | PENDING | PENDING |
| Piku / Continue story | PENDING | PENDING |
| Durable Face | PENDING | PENDING |
| Durable Audio playback/download | PENDING | PENDING |
| Fusion final-only media | PENDING | PENDING |
| Download / share | PENDING | PENDING |
| Saved Work | PENDING | PENDING |
| Spending/history | PENDING | PENDING |
| Native billing rail | PENDING | PENDING |
| Sign-out/resume | PENDING | PENDING |
| **Platform verdict** | **PENDING** | **PENDING** |

## Store-queue authorization

Only after both platform verdicts are `PASS` may the production launcher be run with both explicit guards:

```bash
export DESIFACES_DEVICE_ACCEPTANCE_APPROVED=YES
export DESIFACES_STORE_SUBMISSION_APPROVED=YES
```

The launcher re-runs production parity certification before queuing store builds/submission. Do not set either variable in shell profiles, CI secrets, or persistent environment files.

`STORE_SUBMISSION=NOT_PERFORMED`

`PRODUCTION_TOUCH=NONE`
