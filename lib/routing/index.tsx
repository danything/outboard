// All the copper of the board: one file per block of lib/placement.ts, plus
// the trunks. Each file is one person's; this list is the only shared line.
import { BoostRouting } from "./boost";
import { BuckRouting } from "./buck";
import { InputRouting } from "./input";
import { McuRouting } from "./mcu";
import { PdChargerRouting } from "./pdCharger";
import { PdPcRouting } from "./pdPc";
import { SlotRouting } from "./slot";
import { Switch12Routing } from "./switch12";
import { TrunkRouting } from "./trunks";
import { UsbRouting } from "./usb";

export const Routing = () => (
  <>
    <TrunkRouting />
    <PdPcRouting />
    <PdChargerRouting />
    <UsbRouting />
    <InputRouting />
    <McuRouting />
    <SlotRouting />
    <BoostRouting />
    <Switch12Routing />
    <BuckRouting />
  </>
);
