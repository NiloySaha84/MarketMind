import api from './client.js';

export const createBusinessIdea = async ({ idea, target_market }) => {
  const { data } = await api.post('/business-ideas', { idea, target_market });
  return data.data;
};

export const getBusinessIdeas = async () => {
  const { data } = await api.get('/business-ideas');
  return data.data.business_ideas;
};

export const getBusinessIdeaById = async (id) => {
  const { data } = await api.get(`/business-ideas/${id}`);
  return data.data;
};

// poll until workers finish both analyses + final summary
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
