import { Router } from 'express';
import publicRoutes from '@/routes/public-routes';
import { discordCrawlerPreview } from '@/middleware/crawlerPreview';

const router: Router = Router();

router.use(discordCrawlerPreview);

router.use('/', publicRoutes);

export default router;
