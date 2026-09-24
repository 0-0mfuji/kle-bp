# Keyboard Hardware CAD

KLE-NG をベースに、自作キーボードのレイアウトから **信頼できる KiCad 回路図と PCB の初期設計を生成する**ためのブラウザアプリです。

このプロジェクトの最優先目標は、電子回路に詳しくない人でも、検証済みの回路ブロックを組み合わせて安全性と再現性の高いキーボード回路を作れるようにすることです。

> **重要:** 完全自動 PCB 配線や、DRC を必ず一発で通す基板生成は目標にしません。  
> 回路図の品質、検証可能性、編集しやすさを優先します。

---

## 目的

ユーザーが次の情報を選択・配置するだけで、KiCad プロジェクトを生成できるようにします。

- キー配列
- スイッチ種類
- MCU / コントローラ
- 一体型 / 分割
- USB / バッテリー駆動
- エンコーダー
- トラックボール / ポインティングデバイス
- OLED / Display
- RGB
- その他の対応デバイス

基本フロー:

```text
Layout
  ↓
Devices
  ↓
Controller / Power / Split
  ↓
Hardware Solver
  ↓
Electrical Validation
  ↓
KiCad Schematic
  ↓
PCB Initial Placement
  ↓
Firmware / BOM / Documentation
```

---

## 最重要ルール

### 1. 回路図の信頼性を最優先する

PCB の完全自動配線よりも、正しく読みやすい回路図を生成することを優先します。

生成される回路図は以下を満たすことを目標とします。

- 電気的に妥当である
- 人間が読みやすい
- KiCad 上で普通に編集できる
- 回路ブロック単位で検証可能
- 同じ条件から同じ結果を再生成できる

### 2. 回路を自由生成しない

回路は、事前に検証された `Circuit Block` の組み合わせから生成します。

例:

```text
Controller
Power
USB
Battery
Key Matrix
Encoder
PMW3360
OLED
RGB
Split Interface
```

各 Circuit Block は最低限、以下の情報を持ちます。

```text
Electrical requirements
Provided interfaces
Voltage requirements
GPIO / SPI / I2C / UART / ADC requirements
KiCad schematic definition
Footprints
BOM information
Validation rules
Firmware metadata
Verification status
```

### 3. Hardware Model を唯一の設計データとする

KiCad、QMK、ZMK、BOM などを別々のロジックで生成しません。

すべて同じ `KeyboardHardwareModel` から生成します。

```text
                KeyboardHardwareModel
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
      KiCad             QMK              ZMK
        │
        ├── BOM
        └── Documentation
```

これにより、回路図とファームウェア間のピン不一致を防ぎます。

### 4. MCU ピンを単なる GPIO として扱わない

Pin Solver は以下のリソースを理解する必要があります。

- GPIO
- SPI
- I2C
- UART
- ADC
- PWM
- USB
- Debug pins
- Boot / reserved pins

デバイス要求から利用可能な MCU リソースを解決します。

### 5. 電源設計は検証済み構成から選ぶ

バッテリーや USB 電源回路を任意に組み立てません。

例:

```text
USB Only
USB + Controller-integrated LiPo charging
USB + LiPo + Charger + Regulator
Battery Only
```

新しい Power Architecture を追加する場合は、回路・部品定格・動作条件を確認してから登録します。

---

## 対応予定

### Layout

- KLE-NG ベースのキー配置
- KLE 互換データ
- Split layout
- MX
- Kailh Choc

### Controller

初期対応候補:

- Seeed XIAO RP2040
- Seeed XIAO nRF52840
- Pro Micro 互換 RP2040
- nice!nano

将来的にオンボード MCU にも対応します。

### Input Devices

- Keyboard switches
- EC11 Rotary Encoder
- PMW3360 Trackball
- PMW3389
- Trackpad
- Joystick

### Display / Output

- SSD1306 OLED
- nice!view
- Indicator LED
- RGB / WS2812

### Power

- USB
- LiPo 1S
- Battery connector
- Power switch
- Battery measurement
- Charging
- Regulator

### Split

- Wired split
- UART
- I2C
- Wireless split

---

## Matrix Solver

キーレイアウトから適切な Row / Column 構成を提案します。

評価項目:

- 必要 GPIO 数
- 物理配置との自然さ
- Split 構成
- Firmware との扱いやすさ

Advanced Mode では手動変更も可能にします。

---

## Resource / Pin Solver

デバイスの要求を収集し、MCU に割り当てます。

例:

```text
Key Matrix
  4 ROW GPIO
  6 COL GPIO

EC11
  2 GPIO

PMW3360
  SPI
  1 CS GPIO

OLED
  I2C

Battery Monitor
  ADC
```

Solver は競合や不足を検出します。

---

## Electrical Validator

KiCad ERC だけに依存せず、アプリ独自の検証を行います。

例:

```text
✓ Supply voltage compatible
✓ Required SPI available
✓ GPIO assignment unique
✓ ADC available
✓ Required power pins connected
✓ Required decoupling present
✓ USB configuration valid
✓ Battery configuration valid
✓ Reserved pins not used
```

問題は以下の3段階で表示します。

- `ERROR` — 生成を止めるべき問題
- `WARNING` — 動作する可能性はあるが確認が必要
- `INFO` — 設計上の情報

可能な場合は修正候補も提示します。

---

## KiCad Schematic Generator

生成される回路図は、原則として階層化します。

```text
Root
├── Power
├── Controller
├── Key Matrix
├── Encoders
├── Pointing Device
├── Display
├── RGB
└── Split Interface
```

### 回路図レイアウトルール

- 信号は原則として左から右
- 電源は上
- GND は下
- 水平 / 垂直配線を基本とする
- 長距離配線は Net Label を使う
- シート間は Hierarchical Label を使う
- 同種部品は一定間隔で配置
- 回路ブロックごとに見た目を統一
- 電源回路と信号回路を分離
- 自動生成後も人間が編集しやすい構成にする

---

## PCB Generator

PCB は「完成品」ではなく、良いスタート地点を生成します。

生成対象:

- Switch footprints
- Diodes
- Controller
- Encoder
- Trackball
- Display
- Connectors
- Mounting holes
- Edge.Cuts
- Keepouts
- Net classes
- 初期部品配置

必要に応じて規則的な配線のみ自動化します。

### 対象外

以下は本プロジェクトの必須目標ではありません。

- 完全自動 PCB 配線
- 任意回路に対応する汎用オートルーター
- DRC 一発通過保証
- 自動生成 PCB の無条件な製造保証
- Trackball ケース機構の完全自動設計

---

## Firmware Generator

Hardware Model から Firmware 設定を生成します。

初期候補:

- QMK
- ZMK

回路図と Firmware は必ず同じ Pin Assignment を参照します。

---

## Verification Level

Circuit Block には検証状態を持たせます。

例:

```text
Experimental
  Schematic only

Reviewed
  Datasheet checked
  ERC passed

Verified
  Datasheet checked
  ERC passed
  Hardware tested
  Firmware tested
```

UI 上でも検証レベルを表示します。

---

## 開発原則

1. 正しさを機能数より優先する
2. 未検証回路を「Verified」と表示しない
3. 対応デバイスを急激に増やさない
4. MCU / Device 固有の `if` 文を大量に作らない
5. 制約と Capability で互換性を表現する
6. Circuit Block は独立してテスト可能にする
7. 自動生成結果は人間が編集可能にする
8. 回路と Firmware の設定を二重管理しない
9. 危険な電源構成は生成しない
10. 不明な条件では推測せずエラーまたは警告を出す

---

## 推奨内部構成

```text
project/
├── apps/
│   └── web/
│
├── packages/
│   ├── hardware-model/
│   ├── circuit-library/
│   ├── matrix-solver/
│   ├── resource-solver/
│   ├── power-solver/
│   ├── validator/
│   ├── kicad-export/
│   ├── firmware-export/
│   └── bom-export/
```

KLE-NG 固有コードと Hardware CAD エンジンをできるだけ分離します。

---

## MVP

最初の MVP では対応範囲を意図的に限定します。

### MVP Target

```text
Switch:
  MX
  Choc v1

Controller:
  XIAO RP2040
  XIAO nRF52840

Architecture:
  Unibody
  Wired Split

Devices:
  EC11
  PMW3360
  SSD1306 OLED

Power:
  USB
  Controller-supported LiPo

Output:
  KiCad project
  KiCad schematic
  PCB initial placement
  BOM
```

QMK / ZMK 生成や高度な電源回路は、コアの信頼性を確認してから段階的に追加します。

---

## 非目標

このプロジェクトは以下を目指しません。

- KiCad の代替
- 汎用電子回路 CAD
- あらゆる MCU / センサーへの即時対応
- AI による自由な回路設計
- 完全自動 PCB 製造
- 電気的・機械的安全性の無条件保証

本アプリは **検証済みの限定された構成を、高い再現性で生成すること**を重視します。

---

## Upstream / KLE-NG

このプロジェクトは Keyboard Layout Editor NG (KLE-NG) をベースに開発することを想定しています。

- KLE-NG のライセンス条件を遵守する
- 元の著作権表示とライセンスを保持する
- 本プロジェクトが KLE-NG 公式版ではないことを明記する
- KLE-NG に有益な汎用修正は可能であれば upstream に還元する
- Hardware CAD 固有機能は可能な限り独立モジュールとして実装する

---

## プロジェクトの判断基準

新機能を追加するときは、次の順番で判断します。

```text
1. 回路の信頼性が上がるか
2. 初心者の設計ミスを減らせるか
3. Hardware Model として自然に表現できるか
4. 独立した Circuit Block として検証できるか
5. 既存構成を壊さず追加できるか
6. UI を複雑にしすぎないか
```

これらを満たさない機能は、便利でも後回しにします。

---

## Long-term Goal

最終的にはユーザーが、

```text
42 keys
Choc v1
Split
XIAO nRF52840
LiPo
EC11 x2
PMW3360
nice!view
ZMK
```

のような構成を指定するだけで、

```text
keyboard-project/
├── hardware/
│   ├── keyboard.kicad_pro
│   ├── keyboard.kicad_sch
│   ├── left.kicad_pcb
│   └── right.kicad_pcb
├── firmware/
├── bom/
├── mechanical/
├── docs/
└── project.json
```

を生成できる状態を目指します。

**目標は「PCB を勝手に完成させること」ではなく、「電子回路に詳しくない人でも、信頼できるキーボード回路設計を始められること」です。**

---

## 現在の CAD UI 実装ルール

### Layout Editor を中心にする

Hardware CAD の主画面は KLE-NG の既存 Layout Editor UI を再利用する。旧 KLE セクションを別画面として重複表示しない。

- Controller と Devices は Layout Editor 左側 Toolbar の既存 `+` 操作の直下から追加する
- 独自の選択専用ページや、Layout Editor と重複する編集画面を追加しない
- 既存の `KeyboardCanvas`、`CanvasToolbar`、`KeyPropertiesPanel`、`KeyboardMetadataPanel`、`SummaryPanel`、`LayoutEditorSettingsPanel`、`CanvasFooter`、Toast、Theme 機構を優先して再利用する
- ヘッダーと Footer は既存 KLE-NG のレイアウト・スタイルを維持し、ブランド文字列だけ本アプリ名へ変更できる

### Hardware item の Layout 表現

Toolbar から追加した Controller / Device は、KLE のレイアウト要素として扱う。

- Hardware item は `decal: true`、`profile: "hardware"`、`st: "hardware:<block-id>"` で識別する
- Matrix、plate のスイッチ数、通常のキー割り当てには含めない
- 通常のキーと同じ座標系で表示し、既存 Canvas の選択・ドラッグ・Undo / Redo を利用できる
- 初期サイズは Controller 2U × 2U、EC11 2U × 2U、PMW3360 3U × 3U、SSD1306 OLED 4U × 2U とする
- Hardware item は透明な KLE decal として描画せず、外周の陰影と白い内面を持つキーキャップ風に描画する
- Hardware item のラベルは内側のテキスト領域に配置し、外周の陰影と重ならないようにする
- 同じ Device を複数回配置できる余地を残す。回路ブロックの要求数と BOM 数量は配置数を正しく扱う

### Panel interaction

KLE-NG にあったパネル操作を維持する。

- Layout Editor と Layout properties は見出しをドラッグして上下に並べ替えられる
- 並べ替え中は移動アニメーションと対象パネルのハイライトを表示する
- 見出しの展開 / 縮小ボタンでパネルを開閉できる
- パネルの並び順と開閉状態はクラウドへ保存せず、ブラウザ内の一時 UI 状態として保持する
- Canvas 下端のリサイズハンドルで高さを変更でき、既存の `kle-ng-layout-editor-height` を利用する

---

## Split 設計モデル

Split は Architecture の値だけで表現せず、左右のキー割り当てと接続方式を `KeyboardHardwareModel.split` に保存する。

```text
split:
  connection: none | wired-uart | wireless
  boundaryX: number
  assignments: { <layout-key-id>: left | right }
```

- 通常キーの X 座標を基準に、`boundaryX` より左を Left、それ以外を Right とする
- `boundaryX` が未指定の場合は物理キー配置の左右中央を deterministic に自動計算する
- `Controller / Power / Split` ページでは、小型の配置プレビューと赤い分割境界線を表示する
- 赤い境界線はマウスでドラッグでき、ドラッグ結果を `boundaryX` に反映する
- 数値入力も利用でき、`Auto` で自動中央判定へ戻せる
- 配置プレビューは確認と境界変更に限定し、通常の Layout Editor の全編集機能を複製しない
- `wired-uart` と `wireless` を選択できる
- Wireless split は検証済み Circuit Block が登録されるまで WARNING とし、製造保証済みとは表示しない
- Wired split で接続方式が未指定の場合は ERROR とする

---

## Export 成果物

Export は現在の Hardware Model と Layout Editor の生成結果を同じ deterministic ZIP にまとめる。

```text
keyboard/keyboard.kicad_pro
keyboard/keyboard.kicad_sch
keyboard/keyboard.kicad_pcb
bom/bom.csv
project.json
plate/plate-settings.json
plate/keyboard-plate.svg
plate/keyboard-plate.dxf
plate/keyboard-plate-outline.svg       # outline 有効時
plate/keyboard-plate-outline.dxf       # outline 有効時
```

- Plate Generator が未生成でも、Export 時に現在の設定から自動生成して SVG / DXF を含める
- マージ設定が有効な場合は、マージ済み SVG / DXF を標準ファイル名で含める
- ZIP のエントリ順、JSON のキー順、KiCad 生成物の参照番号・座標・UUID は deterministic にする
- Export は現在の配置、Split 境界、接続方式、電源方式を Hardware Model として保存する
- 出力は KiCad 9+ で確認・編集する初期設計であり、完全自動配線や DRC 一発通過を保証しない
