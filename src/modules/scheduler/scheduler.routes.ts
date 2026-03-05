import { Router } from 'express';
import { schedulerController } from './scheduler.controller';

const router = Router();

// Interval Scheduling APIs
router.post('/check-conflict', schedulerController.checkConflict.bind(schedulerController));
router.post('/schedule-tasks', schedulerController.scheduleTasks.bind(schedulerController));

// Slot Finder APIs
router.post('/find-free-slots', schedulerController.findFreeSlots.bind(schedulerController));
router.post('/find-optimal-slot', schedulerController.findOptimalSlot.bind(schedulerController));

// Productivity Scoring APIs
router.post('/calculate-productivity', schedulerController.calculateProductivity.bind(schedulerController));
router.post('/find-optimal-hours', schedulerController.findOptimalHours.bind(schedulerController));

export default router;
