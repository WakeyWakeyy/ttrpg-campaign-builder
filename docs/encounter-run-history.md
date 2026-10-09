# Encounter Run history

The Session Run View lets the GM record an encounter that happened during play. A run can start from any available placement in that Session or be entered as an improvised encounter. Each record belongs to the Session, stores the outcome, and captures the Encounter title and available creature groups as they stood when saved. A later change to the reusable Encounter or removal of its placement leaves the record intact.

Recording a run requires ownership of the Session and its current revision. The operation saves the run and creature snapshots in one transaction, then advances the Session revision. A copied Session keeps its preparation placements but starts without run history. Runs are append-only in this slice; correction and removal of mistaken records are future work.

The history captures preparation context and the GM's outcome notes. It does not track turns, initiative, damage, or XP awards. Reward planning and grants are separate roadmap steps.
