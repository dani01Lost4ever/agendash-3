#!/usr/bin/env node
// Use node instead of ts-node for compiled output, or keep ts-node for development

import http from 'http';
import { Agenda } from '@sealos/agenda';
import Agendash from './lib/app'; // Import the function that returns { middleware, controller }
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {AgendashController} from "./lib/controllers/agendash";

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
    // Call Agendash, providing the Agenda instance and the SAME mongo URI for Mongoose
    const { middleware: agendashMiddleware, controller } = Agendash(agenda, mongoUri);
    agendashController = controller; // Assign controller for shutdown handler

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
    if (agendashController) await agendashController.closeMongooseConnection();
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

      // Close Agendash's dedicated Mongoose connection
      if (agendashController) {
        await agendashController.closeMongooseConnection();
        // Log message is inside closeMongooseConnection
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
start(); // No top-level await needed here, start handles async internally

// Optional: Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});
