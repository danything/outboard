# 配線の書き方

銅 (線・ビア・面) は `lib/routing/` に、ブロックごとの別ファイルで書く。見本は [`lib/routing/buck.tsx`](../lib/routing/buck.tsx) (降圧)。

## ファイル

| ファイル                  | 持ち場                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/routing/<block>.tsx` | `lib/placement.ts` のブロック 1 つ (`pdPc`・`pdCharger`・`usb`・`input`・`mcu`・`slot`・`boost`・`switch12`・`buck`)。自分の領域 (`BLOCKS[名前].region`) の中だけ |
| `lib/routing/trunks.tsx`  | ブロックをまたぐもの: 基板全体の面 (内層・うら)、VBUS・VIN・12V・USB の D+/D−・マイコンからの制御線                                                               |
| `lib/routing/kit.tsx`     | 線・ビア・面の部品と座標の関数。**銅はこれでしか置かない**                                                                                                        |
| `lib/routing/index.tsx`   | 並べるだけ。触らない                                                                                                                                              |

ほかのブロックとは、`lib/placement.ts` の `HANDOFFS` の点 (座標・層・幅) で受け渡す。自分の領域の辺のその点まで引いて止める。点を動かしたいときは、相手と幹線の担当に言ってから `HANDOFFS` を直す。
部品を動かすのは `lib/placement.ts` の自分のブロックの中だけ。

## 層 (4 層)

| 層       | 中身                                              | 書けるもの            |
| -------- | ------------------------------------------------- | --------------------- |
| `top`    | 部品・信号・電源の面                              | `Track`・`Pour`       |
| `inner1` | GND の面 (基板全体。線で切らない)                 | `trunks.tsx` の面だけ |
| `inner2` | +3V3 の面 (基板全体)                              | `trunks.tsx` の面だけ |
| `bottom` | おもてで交差する信号・J3 の A 列。残りは GND の面 | `Track`・`Pour`       |

GND と +3V3 は、パッドのそばに `Via` を 1 個落とせば内層につながる (GND をおもての線で引き回さない)。ビアは全部貫通。

## 座標

**設計の座標** (`lib/geometry.ts`): 原点は後ろ (ブラケット側) の角、x は右、y はカードから離れる向き、mm。`lib/placement.ts`・`HANDOFFS`・`docs/mechanical.md` と同じ。tscircuit の座標 (y が上) には `kit` が直すので、配線では使わない。

- `pad("U3", 3)`・`pad("J3", "B8")`: パッドの中心 (名前は `lib/footprints.ts` のパッドの名前。ほとんどは番号)
- `center("L1")`: 部品の中心
- `blockFrame("buck")(x, y)`: ブロックのローカル座標 (`placement.ts` で部品を置いている座標) → 設計の座標
- `bun tools/pads.ts buck` (ブロック名か部品名): パッドの位置と大きさ、受け渡しの点の一覧

## 部品

```tsx
<Track net="EN_3V3" width={0.2} layer="top" points={[pad("U3", 2), { x: 85.05, y: 31.45 }, { x: 83.5, y: 31.45 }]} />
<Via net="GND" at={{ x: 87.9, y: 31.8 }} {...VIA.signal} />      {/* 穴 0.3・外径 0.6。電源と熱は VIA.power (0.4・0.8) */}
<Vias net="GND" at={[p, q, r]} {...VIA.signal} />
<Pour net="VIN" layer="top" outline={[{ x: 85.4, y: 30.45 }, …]} />   {/* outline がそのまま銅の形 */}
```

- `Track` は 1 つの層の折れ線。層を変えるときは、同じ点に `Via` を置いて、別の `Track` を続ける
- `Pour` の中のほかのネットの銅は 0.2mm あけて切り抜かれる。外形からは自分で 0.3mm 離す。面どうしは重ねない
- ネットの名前は `lib/nets.ts` (まちがうと型エラー)。幅・穴・外径が製造の下限を下回るとビルドが落ちる

## やってはいけないこと

- `<trace>`・`<via>`・`<copperpour>` をじかに書く (`pcbPath` の座標は部品のローカルで回転込み、`via: true` は穴 0.2mm、ネットへつなぐ線は幅が効かない、面は outline から縮む)
- 自動配線を使う (`routingDisabled` を外さない)
- 電源 (`checks/rules.ts` の `POWER_PATHS`) を細い線で引く。面か、決まりの幅以上の線で
- `inner1`・`inner2` に線や面を足す。降圧・昇圧・USB の線の下のうら (`NO_BOTTOM_UNDER`) に線を通す
- `lib/routing/index.tsx`・`kit.tsx`・ほかの人のファイルを触る (要るときは統合役へ)

## 手元での確かめ方

README の「作り方」のコンテナの中で:

```sh
bun run build && bun run check     # ビルド (tscircuit の検査) → 型・テスト・自前の検査
bun run snapshot --update          # 絵を描き直す。__snapshots__/index.circuit-top.snap.svg・-bottom を見る。差分ごとコミット
bun run lint
```

- `bun checks/run.ts` の出力のうち、製造の条件 (`trackWidth`・`viaSize`・`clearance`・`holeToCopper`・`edgeClearance` など) は 1 件でも落ちる。
  配線に頼る検査 (`powerPaths`・`viaCount`・`netWidth` など) は、全ブロックが入るまで `(open)` と出て落ちない。**自分のブロックの部品の行が消えていること**を確かめる
- KiCad の DRC (CI の `kicad-drc`) の「未接続」は、全ブロックが入るまで除外してある。ほかの指摘は落ちる
