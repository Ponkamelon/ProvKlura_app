type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

/**
 * Händelseloggning (kravspec avsnitt 11). Databasen byter elevens id mot
 * ett pseudonymt id och släpper okända fält, så inga fritextsvar kan
 * hamna i loggen. Loggningen får aldrig stoppa eleven — fel sväljs.
 */
export type LearningEvent =
  | "home_viewed"
  | "session_started"
  | "question_answered"
  | "question_skipped"
  | "session_paused"
  | "session_completed"
  | "session_abandoned"
  | "progress_viewed"
  | "goal_updated";

export async function logEvent(
  supabase: Client,
  event: LearningEvent,
  fields: {
    sessionId?: string | null;
    source?: string | null;
    studySetId?: string | null;
    knowledgePointId?: string | null;
    correct?: boolean | null;
    helpUsed?: boolean | null;
    props?: Record<string, string | number | boolean>;
  } = {},
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_learning_event", {
      p_event: event,
      p_session_id: fields.sessionId ?? null,
      p_source: fields.source ?? null,
      p_study_set_id: fields.studySetId ?? null,
      p_knowledge_point_id: fields.knowledgePointId ?? null,
      p_correct: fields.correct ?? null,
      p_help_used: fields.helpUsed ?? null,
      p_props: fields.props ?? {},
    });
    if (error) console.error(`Kunde inte logga ${event}:`, error.message);
  } catch (err) {
    console.error(`Kunde inte logga ${event}:`, err);
  }
}
