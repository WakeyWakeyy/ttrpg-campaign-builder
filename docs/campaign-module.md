# Campaign module

The Campaign workspace offers a private Markdown module at `export/module`. It reads the same owner-authorized, repeatable-read snapshot as the reference and JSON downloads. It performs no writes and adds no persistence or dependencies to Campaign Core.

The document starts with the Campaign compass and an index of populated chapters: story and threads, people and groups, places and connections, Secrets and discovery, Sessions and history, Encounters and Rewards. Each chapter retains the existing reference's detailed record fields, memberships, ordered Scenes, Encounter placements and run snapshots, Reward components and grants, and recorded Secret knowledge. Closed available Quests remain part of the detailed story. Archived and trashed entities are omitted; historical grants and run snapshots remain history.

This is a GM document, including Secrets and outcomes, and is not safe for players. Preparation and outcomes retain their separate labels. It organizes the GM's accepted records without inventing connective prose or deciding a play order. Markdown readers supporting heading anchors can use the chapter index. JSON remains the complete portability format, including recoverable records. Compact [quick-reference sheets](campaign-quick-reference.md) are also available. PDF and player-safe publishing remain later work.

Validation covers chapter ordering, navigation, lifecycle filtering, empty campaigns, multiline labels, and preservation of plans, outcomes, and historical records. The shared PostgreSQL export integration tests cover owner isolation and consistent snapshot collection.
