import db from '../config/db.js';
import { dispatchOutboxById } from '../queue/outbox-dispatcher.js';
import { getCache, setCache, deleteCache } from '../cache.js';
import { setRLSUser } from '../lib/dbSession.js';

export const createBusinessIdea = async (req, res, next) => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query("BEGIN");
        inTransaction = true;
        const { idea, target_market } = req.body;
        const userId = req.user.id;

        await setRLSUser(client, userId);

        const newBusinessIdea = await client.query(
            "INSERT INTO business_idea (idea_des, target_market, user_id) VALUES ($1, $2, $3) RETURNING *",
            [idea, target_market, userId]
        );

        const jobPayload = JSON.stringify({
            id: newBusinessIdea.rows[0].id,
            idea_des: newBusinessIdea.rows[0].idea_des,
            target_market: newBusinessIdea.rows[0].target_market,
            user_id: newBusinessIdea.rows[0].user_id
        });

        const competitorOutbox = await client.query(
            "INSERT INTO outbox_jobs (job_type, payload) VALUES ($1, $2::jsonb) RETURNING id",
            ["processBusinessIdea", jobPayload]
        );


        const marketOutbox = await client.query(
            "INSERT INTO outbox_jobs (job_type, payload) VALUES ($1, $2::jsonb) RETURNING id",
            ["processMarketAnalysis", jobPayload]
        );

        await client.query("COMMIT");
        inTransaction = false;

        try{
            await deleteCache(`cache:businessIdeas:${userId}`);
        } catch (error) {
            console.error('Failed to delete cache:', error.message);
        }

        const dispatchedJobs = [];
        try {
            if (await dispatchOutboxById(competitorOutbox.rows[0].id)) {
                dispatchedJobs.push('competitors');
            }
            if (await dispatchOutboxById(marketOutbox.rows[0].id)) {
                dispatchedJobs.push('market_analysis');
            }
        } catch (dispatchError) {
            console.error('Immediate outbox dispatch failed; poller will retry:', dispatchError.message);
        }

        res.status(201).json({
            success: true,
            data: {
                business_idea_id: newBusinessIdea.rows[0].id,
                outbox_jobs: {
                    competitors: competitorOutbox.rows[0].id,
                    market_analysis: marketOutbox.rows[0].id
                },
                queue_status: dispatchedJobs.length === 2 ? 'queued' : 'pending_dispatch',
                dispatched: dispatchedJobs
            }
        });
    } catch (error) {
        if (client && inTransaction) {
            await client.query("ROLLBACK");
        }
        next(error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const getBusinessIdeas = async (req, res, next) => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        const userId = req.user.id;
        const cacheKey = `cache:businessIdeas:${userId}`;

        const cachedIdeas = await getCache(cacheKey);
        if (cachedIdeas) {
            console.log('Returning cached ideas');
            return res.status(200).json({
                success: true,
                data: cachedIdeas
            });
        }

        await client.query("BEGIN");
        inTransaction = true;

        await setRLSUser(client, userId);

        const businessIdeas = await client.query(
            "SELECT * FROM business_idea WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );

        const businessIds = businessIdeas.rows.map((businessIdea) => businessIdea.id);

        let competitorRows = [];
        let marketRows = [];
        let reportRows = [];

        if (businessIds.length > 0) {
            const competitorsResult = await client.query(
                "SELECT * FROM competitors WHERE business_id = ANY($1::int[]) ORDER BY created_at DESC, id DESC",
                [businessIds]
            );

            const marketResult = await client.query(
                "SELECT * FROM market_analysis WHERE business_id = ANY($1::int[]) ORDER BY created_at DESC, id DESC",
                [businessIds]
            );

            const reportResult = await client.query(
                "SELECT * FROM report WHERE business_id = ANY($1::int[]) ORDER BY created_at DESC, id DESC",
                [businessIds]
            );

            competitorRows = competitorsResult.rows;
            marketRows = marketResult.rows;
            reportRows = reportResult.rows;
        }

        await client.query("COMMIT");
        inTransaction = false;

        const competitorsByBusinessId = competitorRows.reduce((acc, competitor) => {
            const businessId = competitor.business_id;
            if (!acc[businessId]) {
                acc[businessId] = [];
            }

            acc[businessId].push({
                id: competitor.id,
                business_id: competitor.business_id,
                name: competitor.name,
                website: competitor.website,
                source: competitor.source,
                citations: competitor.raw_data?.sources || [],
                strengths: competitor.strengths,
                weaknesses: competitor.weaknesses,
                created_at: competitor.created_at
            });

            return acc;
        }, {});

        const marketByBusinessId = marketRows.reduce((acc, marketAnalysis) => {
            const businessId = marketAnalysis.business_id;
            if (!acc[businessId]) {
                acc[businessId] = [];
            }

            acc[businessId].push({
                id: marketAnalysis.id,
                business_id: marketAnalysis.business_id,
                market_size: marketAnalysis.market_size,
                five_year_projection: marketAnalysis.five_year_projection,
                growth_per_year: marketAnalysis.growth_per_year,
                market_size_unit: marketAnalysis.market_size_unit,
                source: marketAnalysis.source,
                citations: marketAnalysis.raw_output?.sources || [],
                created_at: marketAnalysis.created_at
            });

            return acc;
        }, {});

        // Rows are ordered newest-first, so keep the first final_summary seen per business.
        const finalSummaryByBusinessId = reportRows.reduce((acc, report) => {
            if (!(report.business_id in acc)) {
                acc[report.business_id] = report.final_summary;
            }

            return acc;
        }, {});

        const responseData = {
            business_ideas: businessIdeas.rows.map((businessIdea) => ({
                id: businessIdea.id,
                idea_des: businessIdea.idea_des,
                target_market: businessIdea.target_market,
                user_id: businessIdea.user_id,
                created_at: businessIdea.created_at,
                final_summary: finalSummaryByBusinessId[businessIdea.id] || null,
                competitors: competitorsByBusinessId[businessIdea.id] || [],
                market_analysis: marketByBusinessId[businessIdea.id] || []
            }))
        }

        try{
            await setCache(cacheKey, responseData, 300);
        } catch (error) {
            console.error('Failed to set cache:', error.message);
        }

        res.status(200).json({
            success: true,
            data: responseData
        }); 
    } catch (error) {
        if (client && inTransaction) {
            await client.query("ROLLBACK");
        }
        next(error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const getBusinessIdeaById = async (req, res, next) => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        const userId = req.user.id;
        const businessIdeaId = Number(req.params.id);

        if (!Number.isInteger(businessIdeaId) || businessIdeaId <= 0) {
            const error = new Error('Invalid business idea id');
            error.statusCode = 400;
            throw error;
        }

        const cacheKey = `cache:businessIdea:${userId}:${businessIdeaId}`;
        const cachedBusinessIdea = await getCache(cacheKey);
        if (cachedBusinessIdea) {
            console.log('Returning cached business idea');
            return res.status(200).json({
                success: true,
                data: cachedBusinessIdea
            });
        }
        await client.query("BEGIN");
        inTransaction = true;

        await setRLSUser(client, userId);

        const businessIdeaResult = await client.query(
            "SELECT * FROM business_idea WHERE id = $1 AND user_id = $2",
            [businessIdeaId, userId]
        );

        if (businessIdeaResult.rows.length === 0) {
            const error = new Error('Business idea not found');
            error.statusCode = 404;
            throw error;
        }

        const competitorsResult = await client.query(
            "SELECT * FROM competitors WHERE business_id = $1 ORDER BY created_at DESC, id DESC",
            [businessIdeaId]
        );

        const marketResult = await client.query(
            "SELECT * FROM market_analysis WHERE business_id = $1 ORDER BY created_at DESC, id DESC",
            [businessIdeaId]
        );

        const reportResult = await client.query(
            "SELECT * FROM report WHERE business_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
            [businessIdeaId]
        );

        await client.query("COMMIT");
        inTransaction = false;

        const businessIdea = businessIdeaResult.rows[0];

        const responseData = {
            id: businessIdea.id,
            idea_des: businessIdea.idea_des,
            target_market: businessIdea.target_market,
            user_id: businessIdea.user_id,
            created_at: businessIdea.created_at,
            final_summary: reportResult.rows[0]?.final_summary || null,
            competitors: competitorsResult.rows.map((competitor) => ({
                id: competitor.id,
                business_id: competitor.business_id,
                name: competitor.name,
                website: competitor.website,
                source: competitor.source,
                citations: competitor.raw_data?.sources || [],
                strengths: competitor.strengths,
                weaknesses: competitor.weaknesses,
                created_at: competitor.created_at
            })),
            market_analysis: marketResult.rows.map((marketAnalysis) => ({
                id: marketAnalysis.id,
                business_id: marketAnalysis.business_id,
                market_size: marketAnalysis.market_size,
                five_year_projection: marketAnalysis.five_year_projection,
                growth_per_year: marketAnalysis.growth_per_year,
                market_size_unit: marketAnalysis.market_size_unit,
                source: marketAnalysis.source,
                citations: marketAnalysis.raw_output?.sources || [],
                created_at: marketAnalysis.created_at
            }))
        }

        try{
            console.log('Setting cached business idea');
            await setCache(cacheKey, responseData, 300);
        } catch (error) {
            console.error('Failed to set cache:', error.message);
        }

        res.status(200).json({
            success: true,
            data: responseData
        });
    } catch (error) {
        if (client && inTransaction) {
            await client.query("ROLLBACK");
        }
        next(error);
    } finally {
        if (client) {
            client.release();
        }
    }
};