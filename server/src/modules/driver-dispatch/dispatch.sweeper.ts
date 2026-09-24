import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DispatchService } from './dispatch.service';

/**
 * Every few seconds: expire unanswered offers, move on to the next drivers, and
 * retry requests that found nobody nearby. Safe to run on several instances:
 * each step is a single conditional UPDATE, and (ride, driver) is unique.
 */
@Injectable()
export class DispatchSweeper {
  private readonly logger = new Logger(DispatchSweeper.name);
  private running = false;
  private lastLogged = 0;

  constructor(private readonly dispatch: DispatchService) {}

  @Interval(5000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatch.expireStale();
      await this.dispatch.retryOpenRides();
    } catch (err) {
      // Never let a background failure crash the process; log at most once a minute.
      if (Date.now() - this.lastLogged > 60_000) {
        this.lastLogged = Date.now();
        this.logger.error(`Dispatch sweep failed: ${(err as Error).message}`);
      }
    } finally {
      this.running = false;
    }
  }
}
