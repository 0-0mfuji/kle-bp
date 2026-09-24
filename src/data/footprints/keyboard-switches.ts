import type { FootprintSnapshot } from './index'
import MX_Solder_1u from './MX_Solder_1u.json'
import MX_Solder_1_25u from './MX_Solder_1.25u.json'
import MX_Solder_1_5u from './MX_Solder_1.5u.json'
import MX_Solder_1_75u from './MX_Solder_1.75u.json'
import MX_Solder_2u from './MX_Solder_2u.json'
import MX_Solder_2_25u from './MX_Solder_2.25u.json'
import MX_Solder_2_75u from './MX_Solder_2.75u.json'
import MX_Hotswap_1u from './MX_Hotswap_1u.json'
import MX_Hotswap_1_25u from './MX_Hotswap_1.25u.json'
import MX_Hotswap_1_5u from './MX_Hotswap_1.5u.json'
import MX_Hotswap_1_75u from './MX_Hotswap_1.75u.json'
import MX_Hotswap_2u from './MX_Hotswap_2u.json'
import MX_Hotswap_2_25u from './MX_Hotswap_2.25u.json'
import MX_Hotswap_2_75u from './MX_Hotswap_2.75u.json'
import MX_Hotswap_3u from './MX_Hotswap_3u.json'
import MX_Hotswap_6_25u from './MX_Hotswap_6.25u.json'
import MX_Hotswap_7u from './MX_Hotswap_7u.json'
import MX_Solder_2u_Rev from './MX_Solder_2u_Rev.json'
import MX_Solder_2_25u_Rev from './MX_Solder_2.25u_Rev.json'
import MX_Solder_2_75u_Rev from './MX_Solder_2.75u_Rev.json'
import MX_Hotswap_2u_Rev from './MX_Hotswap_2u_Rev.json'
import MX_Hotswap_2_25u_Rev from './MX_Hotswap_2.25u_Rev.json'
import MX_Hotswap_2_75u_Rev from './MX_Hotswap_2.75u_Rev.json'
import ChocV1V2_Hotswap_1u from './ChocV1V2_Hotswap_1u.json'
import ChocV1V2_Hotswap_1_25u from './ChocV1V2_Hotswap_1.25u.json'
import ChocV1V2_Hotswap_1_5u from './ChocV1V2_Hotswap_1.5u.json'
import ChocV1V2_Hotswap_1_75u from './ChocV1V2_Hotswap_1.75u.json'
import ChocV1V2_Hotswap_2u from './ChocV1V2_Hotswap_2u.json'
import ChocV1V2_Hotswap_2_25u from './ChocV1V2_Hotswap_2.25u.json'
import ChocV2_Hotswap_1u from './ChocV2_Hotswap_1u.json'
import ChocV2_Hotswap_2u from './ChocV2_Hotswap_2u.json'
import ChocV1V2 from './ChocV1V2.json'
import ChocV2 from './ChocV2.json'
import LED_SK6812MINI_E_BL from './LED_SK6812MINI-E_BL.json'

export const SWITCH_FOOTPRINT_SNAPSHOTS: FootprintSnapshot[] = [
  MX_Solder_1u as FootprintSnapshot, MX_Solder_1_25u as FootprintSnapshot, MX_Solder_1_5u as FootprintSnapshot, MX_Solder_1_75u as FootprintSnapshot,
  MX_Solder_2u as FootprintSnapshot, MX_Solder_2_25u as FootprintSnapshot, MX_Solder_2_75u as FootprintSnapshot,
  MX_Hotswap_1u as FootprintSnapshot, MX_Hotswap_1_25u as FootprintSnapshot, MX_Hotswap_1_5u as FootprintSnapshot, MX_Hotswap_1_75u as FootprintSnapshot,
  MX_Hotswap_2u as FootprintSnapshot, MX_Hotswap_2_25u as FootprintSnapshot, MX_Hotswap_2_75u as FootprintSnapshot, MX_Hotswap_3u as FootprintSnapshot,
  MX_Hotswap_6_25u as FootprintSnapshot, MX_Hotswap_7u as FootprintSnapshot,
  MX_Solder_2u_Rev as FootprintSnapshot, MX_Solder_2_25u_Rev as FootprintSnapshot, MX_Solder_2_75u_Rev as FootprintSnapshot,
  MX_Hotswap_2u_Rev as FootprintSnapshot, MX_Hotswap_2_25u_Rev as FootprintSnapshot, MX_Hotswap_2_75u_Rev as FootprintSnapshot,
  ChocV1V2_Hotswap_1u as FootprintSnapshot, ChocV1V2_Hotswap_1_25u as FootprintSnapshot, ChocV1V2_Hotswap_1_5u as FootprintSnapshot,
  ChocV1V2_Hotswap_1_75u as FootprintSnapshot, ChocV1V2_Hotswap_2u as FootprintSnapshot, ChocV1V2_Hotswap_2_25u as FootprintSnapshot,
  ChocV2_Hotswap_1u as FootprintSnapshot, ChocV2_Hotswap_2u as FootprintSnapshot, ChocV1V2 as FootprintSnapshot, ChocV2 as FootprintSnapshot,
  LED_SK6812MINI_E_BL as unknown as FootprintSnapshot,
]
