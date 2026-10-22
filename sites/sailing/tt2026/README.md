# Sailing KOBE 2026 — 演舞ナビ (PWA)

2026-07-04（土）メリケンパーク開催のSailing KOBE 2026を対象とした、**3会場 × 5分**の演舞タイムラインです。既存のMatsuri FES GitHub Pagesサイトには影響しない独立した静的ディレクトリです。

## 公開URL

GitHub Pagesを `main / root` から配信すると、`https://naoshi-git.github.io/matsuri-fes/sites/sailing/tt2026/` に配置されます。公開を確認できない間はこのURLを運用済みとみなさないでください。

**注意：2026年大会はすでに終了しています。** 現在のUIはアーカイブ再生モードです。2027年以降は開催日と公式TTを更新し、ソースを再照合してください。

## 主な機能

- メイン、サブ、パレードの3会場について、9:30–15:20の5分行を共有したタイムライン
- 62チーム検索、全出演スロットの横断表示、お気に入りの端末内保存
- 大会当日は端末の日本時間（Asia/Tokyo）に沿った現在行・会場別「いま／次」、それ以外は時刻スライダーによる再生モード
- ホーム画面への追加、オフライン閲覧、iOS 16.4+のホーム画面PWAからのWeb Push受信
- Firebaseを設定すると、匿名サインイン・端末別購読保存・出演5分前通知・フィナーレ進出発表通知が可能
- Firestoreの `live/status` を運営が更新すると、予定と区別した会場ごとの遅延補正を表示・通知に反映

**区別すること：** PWAのインストール／通知許可と、バックグラウンドでプッシュを送るサーバーは別機能です。現状の `config.js` は未設定です。未接続状態で「通知を設定する」は成功扱いにせず、説明を表示します。「端末でテスト通知」は端末側のAPI確認に過ぎず、サーバー送信確認ではありません。GitHub Pages単独でアプリを閉じたときの時刻指定プッシュを保証しません。

## TTの根拠と転記

- [会場横断の公式TT・第2版（2026/05/25 07:53）](https://drive.google.com/file/d/1Y8YE9S_FbQe0vc9gQj31nU96PlZbdR1q/view)
- [チーム別公式TT・第2版（2026/05/24 21:40）](https://drive.google.com/file/d/1CJ-MmhokJQTvi-qdBmp4aKARGgU2XyQq/view)
- [主催者サイト](https://www.matsuri-fes.com/Sailing-KOBE)

`data/schedule.json` は会場別TTから生成し、チーム別TTの全出演と照合しています。会場別PDFのテキスト抽出により末尾が欠けた **嘉們-KAMON-（パレ 13:55）** と **一華 -Ikka-（パレ 14:50）** を修復し、最終行の **15:20 メイン・サブの総踊り** も反映。合計189スロット／62チーム。余興・休憩・開会もスロットに含まれます。

フィナーレの一覧は公式PDFの末尾から作成しています。時間が行と一致しない項目には `approximate:true` を設定し、UIで **目安** と明示しています。進出チームは資料に存在しないため、仮データで補完していません。

**データを更新する際は** `data/schedule.json` と `functions/schedule.json` を同一内容にし、イベント日・ソース版・全チーム照合を更新してください。運営進行の実測情報がない状態で「実際に出演中」と断定してはいけません。

## 起動・検証

リポジトリのルートから：

```sh
python3 -m http.server 8000
# http://localhost:8000/sites/sailing/tt2026/
node --test sites/sailing/tt2026/tests/*.test.cjs
```

静的ページなのでビルドは不要。静的ルートが相対パスで統一されているため、GitHub Pagesのサブパス配信でもService Workerのスコープが他のサイトへ広がりません。

## バックグラウンド通知の本番導入（初回だけ手動）

1. Firebaseプロジェクトを作成し **Cloud Firestore / Anonymous Authentication / Cloud Functions（Blazeプラン）** を有効にする。Functions/Firestoreのリージョンを `asia-northeast1` に合わせる。配信処理はCloud Schedulerを使用します（従量課金の可能性）。
2. Firebase Web appの公開設定（`apiKey, authDomain, projectId, appId` 等）を取得する。
3. `sites/sailing/tt2026/functions` で `npm install`。`npx web-push generate-vapid-keys` で鍵ペアを生成。**秘密鍵をGitHubにコミットしない。**
4. Firebase CLIで `firebase login` し、このディレクトリで `firebase functions:secrets:set VAPID_PUBLIC_KEY --project <PROJECT_ID>` および `firebase functions:secrets:set VAPID_PRIVATE_KEY --project <PROJECT_ID>` を実行する。
5. 同ディレクトリ（`sites/sailing/tt2026`）に移動し、`firebase deploy --only functions,firestore:rules --project <PROJECT_ID>` を実行する。
6. `config.js` の `firebase` に上記公開Web設定、`vapidPublicKey` に公開VAPID鍵、`region` に `asia-northeast1` を指定して公開。**Firebase Web設定は秘密鍵ではありません。**
7. iPhoneではSafariから「共有 → ホーム画面に追加」し、ホーム画面のアプリで「出演通知を有効にする」を押す。Android/desktopは対応ブラウザから同様に許可。Chrome・Safariの両方で実機テストする。

購読情報・暗号化鍵はFirestore `subscriptions` に保存されます。クライアントはこれらのデータを直接読み書きできず、匿名認証付きCallable Function経由のみで更新できます。公開リポジトリに購読者情報・鍵・Firebase Admin権限を置かないでください。Cloud Functionsは全登録者を無条件に毎分読み込むのではなく、通知対象チームだけを配列検索します。

### 運営による進行反映（Firebase Consoleから）

Firestore `live/status` ドキュメントを管理者が更新します（閲覧は公開、ブラウザからの書き込みは禁止）。

```json
{
  "updatedAt": "Firestore Timestamp（コンソールで設定）",
  "venues": {
    "main": {"offsetMinutes": 5},
    "sub": {"offsetMinutes": 0},
    "parade": {"offsetMinutes": -5}
  }
}
```

`offsetMinutes` は5分単位（許容-60〜+120分）で、公式TTからの変更幅です。更新を運用しない場合は予定時刻に基づく表示・通知となります。データの信頼性を確保するには運営担当者による更新が必要です。

フィナーレ進出チーム発表時は、Firestore `announcements/finale` に `published:true`, `publishVersion:1`, `title:"フィナーレ進出チーム発表"`, `message:"..."` を入力。再告知時はバージョンを増やします。未公開はクライアントから読めず、`published` とバージョン変更をトリガーに対象端末へ配信します。**2026年度のデータのままで今送信しないこと。**

## 制約と品質

- 通知時刻はOS、通信状態、端末の省電力制御に左右され、秒単位の配送保証はできません。5分前の**送信開始時刻**を保証する設計です。
- 予定表は実際の出演実績ではありません。遅延／変更を反映させるには運営側が `live/status` を更新します。
- Firestore購読情報は個人データに準ずるものとして保持期間・削除手順・プライバシーポリシーを、本番の観客公開前に定めること。
- 2026大会終了後は、発表トリガーやアーカイブで誤通知を送らないようにする必要があります。
- Material Design **2** のコンポーネント原則（56dp前後の底部ナビ、3つの恒常タブ、Surface/elevation、8dpスペーシング、押下領域と明確なフォーカス）を採用。Material 3の大型ピルや派手なグラデーションは採用しません。
