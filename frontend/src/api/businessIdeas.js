import api from './client.js';

// POST /business-ideas -> { business_idea_id, outbox_jobs, queue_status, dispatched }
export const createBusinessIdea = async ({ idea, target_market }) => {
  const { data } = await api.post('/business-ideas', { idea, target_market });
  return data.data;
};

// GET /business-ideas -> { business_ideas: [...] }
export const getBusinessIdeas = async () => {
  const { data } = await api.get('/business-ideas');
  return data.data.business_ideas;
};

// GET /business-ideas/:id -> full idea with final_summary, competitors, market_analysis
export const getBusinessIdeaById = async (id) => {
  const { data } = await api.get(`/business-ideas/${id}`);
  return data.data;
};

// A report is "ready" once the async workers have produced both analyses and
// the AI final summary. We poll getBusinessIdeaById until these appear.
export const isReportReady = (idea) =>
  Boolean(
    idea &&
      idea.final_summary &&
      Array.isArray(idea.competitors) &&
      idea.competitors.length > 0 &&
      Array.isArray(idea.market_analysis) &&
      idea.market_analysis.length > 0
  );

export const hasAnyData = (idea) =>
  Boolean(
    idea &&
      (idea.final_summary ||
        (idea.competitors?.length ?? 0) > 0 ||
        (idea.market_analysis?.length ?? 0) > 0)
  );
