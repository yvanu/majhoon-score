# Third-party assets

## Mahjong tile artwork

The colored mahjong tile artwork is sourced from [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles).

The upstream repository states that all assets are released into the public domain under CC0 1.0 Universal.

The mini program retrieves these PNG assets through its own Cloudflare Worker endpoint so the WeChat client only contacts the configured application domain. The white dragon is rendered with a blue frame to match the common Chinese mahjong appearance.
