import exitHook from "async-exit-hook";
import { logger } from "./debug.js";

const log = logger.extend("shutdown");

type ShutdownHandler = () => Promise<void> | void;

interface RegisteredHandler {
  name: string;
  handler: ShutdownHandler;
}

// Module-level state
const handlers: RegisteredHandler[] = [];
let isShuttingDown = false;
let isInitialized = false;

/**
 * Initialize the shutdown manager with async-exit-hook
 */
function initialize(): void {
  if (isInitialized) return;

  log("Initializing graceful shutdown manager");

  // Register the main shutdown handler with async-exit-hook
  exitHook(async (callback) => {
    await executeShutdown();
    callback();
  });

  // Handle uncaught exceptions gracefully
  exitHook.uncaughtExceptionHandler(async (err, callback) => {
    log("Uncaught exception during shutdown:", err);
    await executeShutdown();
    callback();
  });

  // Handle unhandled rejections gracefully
  exitHook.unhandledRejectionHandler(async (err, callback) => {
    log("Unhandled rejection during shutdown:", err);
    await executeShutdown();
    callback();
  });

  isInitialized = true;
  log("Shutdown manager initialized");
}

/**
 * Execute all registered shutdown handlers
 */
async function executeShutdown(): Promise<void> {
  if (isShuttingDown) {
    log("Shutdown already in progress, skipping");
    return;
  }

  isShuttingDown = true;
  log(`Starting graceful shutdown with ${handlers.length} registered handlers`);

  const shutdownPromises = handlers.map(async ({ name, handler }) => {
    try {
      log(`Running shutdown handler: ${name}`);
      await handler();
      log(`✅ Shutdown handler completed: ${name}`);
    } catch (error) {
      log(`❌ Shutdown handler failed: ${name}`, error);
      // Continue with other handlers even if one fails
    }
  });

  try {
    // Wait for all handlers to complete (or timeout)
    await Promise.allSettled(shutdownPromises);
    log("All shutdown handlers completed");
  } catch (error) {
    log("Error during shutdown execution:", error);
  }
}

/**
 * Register a shutdown handler for a module
 * @param name - Name of the module/component
 * @param handler - Async function to run during shutdown
 */
export function registerShutdownHandler(
  name: string,
  handler: ShutdownHandler,
): void {
  initialize();

  log(`Registering shutdown handler: ${name}`);
  handlers.push({ name, handler });
}

/**
 * Unregister a shutdown handler
 * @param name - Name of the module/component to unregister
 */
export function unregisterShutdownHandler(name: string): void {
  const initialLength = handlers.length;
  const index = handlers.findIndex((h) => h.name === name);

  if (index !== -1) {
    handlers.splice(index, 1);
    log(`Unregistered shutdown handler: ${name}`);
  }
}

/**
 * Manually trigger shutdown (useful for CLI commands)
 * @param exitCode - Exit code to use (default: 0)
 */
export async function gracefulShutdown(exitCode: number = 0): Promise<void> {
  log(`Manual shutdown requested with exit code: ${exitCode}`);
  await executeShutdown();
  process.exit(exitCode);
}

/**
 * Get the list of registered handlers (for debugging)
 */
export function getRegisteredHandlers(): string[] {
  return handlers.map((h) => h.name);
}

// Handle graceful shutdown signals
process.on("SIGINT", async () => {
  await gracefulShutdown(0);
});

process.on("SIGTERM", async () => {
  await gracefulShutdown(0);
});
