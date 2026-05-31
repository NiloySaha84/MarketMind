import { Router } from 'express';
import { createBusinessIdea, getBusinessIdeas, getBusinessIdeaById } from '../controllers/businessIdea.controller.js';
import authorize from '../middleware/auth.middleware.js';

const businessIdeaRouter = Router();

businessIdeaRouter.post('/', authorize, createBusinessIdea);
businessIdeaRouter.get('/', authorize, getBusinessIdeas);
businessIdeaRouter.get('/:id', authorize, getBusinessIdeaById);

export default businessIdeaRouter;