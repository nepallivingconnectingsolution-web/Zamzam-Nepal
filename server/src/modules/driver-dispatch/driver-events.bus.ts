import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface DriverEvent {
  /** 'offer' | 'offer_cancelled' | 'status' */
  type: string;
  data: unknown;
}

/**
 * In-process fan-out of realtime events to a driver's open app(s). Simple and
 * correct for a single API instance; with several instances, back this with
 * Redis pub/sub (the interface would not change). The driver app also polls
 * /driver/offers/pending, so a missed event only delays an offer.
 */
@Injectable()
export class DriverEventsBus {
  private readonly subjects = new Map<string, Subject<DriverEvent>>();

  publish(userId: string, event: DriverEvent): void {
    this.subjects.get(userId)?.next(event);
  }

  stream(userId: string): Observable<DriverEvent> {
    return new Observable<DriverEvent>((subscriber) => {
      let subject = this.subjects.get(userId);
      if (!subject) {
        subject = new Subject<DriverEvent>();
        this.subjects.set(userId, subject);
      }
      const inner = subject.subscribe(subscriber);
      return () => {
        inner.unsubscribe();
        if (subject && !subject.observed) this.subjects.delete(userId);
      };
    });
  }
}
