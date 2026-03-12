"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const scheduler_controller_1 = require("./scheduler.controller");
const router = (0, express_1.Router)();
// Interval Scheduling APIs
router.post('/check-conflict', scheduler_controller_1.schedulerController.checkConflict.bind(scheduler_controller_1.schedulerController));
router.post('/schedule-tasks', scheduler_controller_1.schedulerController.scheduleTasks.bind(scheduler_controller_1.schedulerController));
// Slot Finder APIs
router.post('/find-free-slots', scheduler_controller_1.schedulerController.findFreeSlots.bind(scheduler_controller_1.schedulerController));
router.post('/find-optimal-slot', scheduler_controller_1.schedulerController.findOptimalSlot.bind(scheduler_controller_1.schedulerController));
// Productivity Scoring APIs
router.post('/calculate-productivity', scheduler_controller_1.schedulerController.calculateProductivity.bind(scheduler_controller_1.schedulerController));
router.post('/find-optimal-hours', scheduler_controller_1.schedulerController.findOptimalHours.bind(scheduler_controller_1.schedulerController));
exports.default = router;
