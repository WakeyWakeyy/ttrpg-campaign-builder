# A28 Previous-session context

The Session page shows the most recently created earlier Session in the same Campaign, including its recorded outcome and the outcomes of its available Scenes. This keeps what happened at the table visible while preparing the next Session. The previous Session remains linked so the GM can review its full plan and notes.

This is read-only context derived from existing Session and Scene records. It does not copy outcomes into the current plan. Sessions and Scenes in trash are excluded. If there is no earlier available Session, or no outcome has been recorded, the page says so. The query resolves the internal Actor and scopes both the Session and its Scenes to the owned Campaign.

Integration coverage checks ownership, recorded Scene outcomes, and exclusion of trashed Sessions.
