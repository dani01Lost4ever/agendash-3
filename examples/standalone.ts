#!/usr/bin/env node
// Use node instead of ts-node for compiled output, or keep ts-node for development

import http from 'http';
import { Agenda } from '@sealos/agenda';
import Agendash from '../src'; // Import the function that returns { middleware, controller }
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AgendashController } from "../src";
import { seedDemoJobs } from './demo-jobs';

async function start() {
  let mongoServer: MongoMemoryServer | null = null;
  let agenda: Agenda | null = null;
  let agendashController: AgendashController | null = null; // Define controller type
  let server: http.Server | null = null;

  try {
    console.log('Starting MongoDB Memory Server...');
    mongoServer = await MongoMemoryServer.create({});
    const mongoUri = mongoServer.getUri();
    console.log(`MongoDB Memory Server running at: ${mongoUri}`);

    console.log('Initializing Agenda...');
    agenda = new Agenda({
      db: {
        address: mongoUri,
        collection: 'agendash-test-collection', // Use a specific collection
      },
      // Add any other Agenda options here
    });

    // Wait for Agenda to connect (optional but good practice)
    await agenda.start(); // agenda.start() connects and starts processing
    console.log('Agenda connected and started.');

    console.log('Initializing Agendash...');
    // Task logs are stored in the database Agenda already uses.
    // AGENDASH_API_KEY turns on API-key authentication, AGENDASH_READ_ONLY=true the read-only mode.
    const apiKey = process.env.AGENDASH_API_KEY;
    const { middleware: agendashMiddleware, controller } = Agendash(agenda, {
      auth: apiKey ? { type: 'apiKey', keys: apiKey } : undefined,
      readOnly: process.env.AGENDASH_READ_ONLY === 'true',
    });
    agendashController = controller; // Assign controller for shutdown handler

    // AGENDASH_DEMO=1 fills the dashboard with sample jobs in every state
    if (process.env.AGENDASH_DEMO === '1') {
      await seedDemoJobs(agenda);
      console.log('Demo jobs created.');
    }

    const app = express();

    // Use the Agendash middleware
    app.use('/', agendashMiddleware);

    const serverPort = process.env.PORT || 3000;
    app.set("port", serverPort);

    server = http.createServer(app);
    server.listen(serverPort, () => {
      console.log(
        `Agendash standalone server started successfully on http://localhost:${serverPort}/`
      );
    });

  } catch (error) {
    console.error('Failed to start Agendash standalone:', error);
    // Ensure resources are cleaned up even if startup fails partially
    if (agenda) await agenda.stop();
    if (agendashController) await agendashController.close();
    if (mongoServer) await mongoServer.stop();
    process.exit(1);
  }

  // Graceful Shutdown Handler (defined inside start to have closure)
  async function gracefulShutdown(signal: string) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    try {
      // Stop accepting new connections
      if (server) {
        server.close(() => {
          console.log('HTTP server closed.');
        });
      }

      // Stop Agenda processing and disconnect
      if (agenda) {
        await agenda.stop(); // agenda.stop() handles graceful shutdown
        console.log('Agenda stopped.');
      }

      // Detach Agendash from Agenda's events
      if (agendashController) {
        await agendashController.close();
      }

      // Stop the in-memory MongoDB server
      if (mongoServer) {
        await mongoServer.stop();
        console.log('MongoDB Memory Server stopped.');
      }

      console.log('Shutdown complete.');
      process.exit(0);

    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Catches Ctrl+C
}

// Start the application
void start(); // No top-level await needed here, start handles async internally

// Optional: Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});
