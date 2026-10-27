# Brand

The product mark is `brand/logo.jpg`. The second zero carries the check. "Proof" is navy. Do not redraw the wordmark, recolor it, or set it on a tinted plate. Give it clear space equal to the height of the check.

Colors live in `brand/tokens.css`.

| Role | Token | Hex | Use |
| --- | --- | --- | --- |
| Navy | `--proof-navy` | `#0B1F3A` | Primary text, icons, the Proof wordmark |
| Blue | `--proof-blue` | `#1A6DFF` | Start of the 100 gradient |
| Cyan | `--proof-cyan` | `#00C4FF` | Middle of the gradient |
| Teal | `--proof-teal` | `#00D4B8` | End of the gradient, verified and positive states |
| Surface | `--proof-surface` | `#FFFFFF` | Page background |
| Soft surface | `--proof-surface-soft` | `#F7F9FC` | Cards and secondary panels |
| Secondary text | `--proof-text-secondary` | `#5A6A7E` | Labels and supporting copy |

`--proof-gradient` runs left to right, blue to cyan to teal, matching the 100. Use it on the mark, the primary action, and verification progress. Teal alone means confirmed. Navy is the text color, not a second brand color to sprinkle around.

Type is the system sans in `--proof-font`. The logo file is the only logotype.

Motion uses one curve, `--proof-ease`. Controls move in `--proof-duration-fast` (180ms). Panels and route content use `--proof-duration` (320ms). A scan progress treatment may use `--proof-duration-slow` (560ms). Lists stagger by `--proof-stagger`, and only the first eight items. Animate `transform` and `opacity`. `prefers-reduced-motion` collapses the durations.

The loading mark is `brand/loader-mark.png`: the gradient ring and the check, turned together. It rotates one full turn every 1.5 seconds on a linear loop, because an eased loop would hitch. The mark fades in, and the screen that replaces it fades in, both on `--proof-ease`. Reduced motion shows the still mark.
