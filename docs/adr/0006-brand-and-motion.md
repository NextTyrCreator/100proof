# ADR 0006: Brand mark, palette, and motion

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
The interface has to feel like one product: a modern, quiet flow, with the verification idea visible in the mark. A second palette or a set of one-off easings would make the demo look assembled.

## Decision
The logo in `packages/ui/brand/logo.jpg` is the system mark. UI color, type, radius, shadow, and motion come only from `packages/ui/brand/tokens.css`, documented in `packages/ui/BRAND.md`.

Navy `#0B1F3A` is primary text. The 100 gradient is `#1A6DFF` → `#00C4FF` → `#00D4B8`. Teal is the verified state. Pages are white; cards are `#F7F9FC`; supporting text is `#5A6A7E`.

Motion is one ease, `cubic-bezier(0.22, 1, 0.36, 1)`, at 180ms, 320ms, and 560ms. Transform and opacity only. Reduced motion collapses those durations.

## Consequences
Screens import the token file instead of inventing hex values. The mark is not recreated in CSS. A new color or a new easing needs a change to the token file and this ADR.
