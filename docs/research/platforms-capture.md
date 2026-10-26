# Live GetItems capture with include_extra_details, include_basic_info, include_platforms (maintainer, 2026-10-26)
platforms object shape (Cyberpunk): {"windows":true,"mac":true,"vr_support":{},"steam_deck_compat_category":3,"steam_os_compat_category":2,"steam_frame_compat_category":2,"steam_machine_compat_category":3}  (about 175 bytes per item)
Enum (SteamDatabase Protobufs enums.proto, verified by agent): 0 Unknown, 1 Unsupported, 2 Playable, 3 Verified

| appid | game | deck | steamos | frame | machine | feature_categoryids has 62 (Family Sharing)? | has 35 (IAP)? |
| 1091500 | Cyberpunk 2077 | 3 | 2 | 2 | 3 | yes | no |
| 730 | Counter-Strike 2 (free) | 2 | 2 | 0 | 2 | no | yes |
| 1174180 | Red Dead Redemption 2 | 2 | 2 | 1 | 2 | no | yes |
| 1808500 | ARC Raiders | 2 | 2 | 0 | 3 | yes | yes |
| 3751950 | Assassin's Creed Black Flag Resynced | 3 | 2 | 0 | 3 | no | yes |
| 1145360 | Hades | 3 | 2 | 3 | 3 | yes | no |
| 3489340 | ReBlade: The Death Spiral (coming soon) | 0 | 0 | 0 | 0 | yes | no |
Note: platforms present on all 7 items; all zeros for the unreleased game. Hades feature_categoryids [22,29,13,23,41,42,43,62].
The demo item 4513800 (earlier capture) had no feature_categoryids and no platforms request.
Other fields: platforms.windows, mac, steamos_linux, vr_support.
