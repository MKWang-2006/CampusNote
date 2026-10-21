# Events: user guide

Campus organizations post events with a limited number of free tickets that go on sale at a set time. You can book one ticket per event and show its code at the door.

Implemented and checked on 21 October 2026. Screenshots below are the original phone-width captures of seed accounts; they document the feature flow, not the desktop layout. On desktop, use Events in the sidebar. On compact screens, open `/events` directly or use Me → My tickets until the teammate-owned Search page is finished. Updated desktop/tablet/phone screenshots are in [the responsive guide](../../architecture/RESPONSIVE.md#reference-views).

**On a computer or phone:** Campus Notes is a responsive website. When logged in, use the left sidebar on desktop or the bottom tabs on tablets and phones. The same destinations and actions are available at every width. Event and ticket cards use the available space; event forms stay readable, and attendee tables can scroll sideways inside their own panel. These instructions use “tap” for either clicking or tapping. See [the responsive layout guide](../../architecture/RESPONSIVE.md) for viewport details.

## 1. Finding an event

Open **Events** from the "Campus events" card on the Search tab or from an announcement on the feed. While you have no tickets, **Me → My tickets** also has a button that opens the events list.

The list shows upcoming events you can attend, soonest first. Each card shows the organizer, the place, the start time and a status:

| Status | Meaning |
|---|---|
| **On sale · 48 left** | You can book now. |
| **Opens in 01:59:30** | Tickets are not on sale yet; the timer counts down to the release. |
| **Sold out** | Every ticket is taken. Tickets come back if someone cancels, so check again later. |
| **Happening now** | The event has started; booking is closed. |
| **Ended** | The event is over. You see this on the event page and, for organizers, in My events; the list itself leaves ended events out. |
| **Cancelled** | The organizer cancelled the event. |
| ✓ **Booked** | You already hold a ticket. |

Some events are for one university only ("HKU members only"). If you are from another university you will not see them.

![Events list](screenshots/events-list.png)

## 2. Booking a ticket

1. Open the event.
2. If the timer is running, stay on the page: when it reaches zero, the **Book a ticket** button appears by itself.
3. Tap **Book a ticket**. If a ticket is left, you see "Booked. Your ticket code is FN7Q2K9A." and the code stays on the event page.

Popular events can sell out within seconds of opening. Exactly as many people as there are tickets get one; everyone else sees "Sold out". Booking twice is not possible: one ticket per person.

![Event release countdown](screenshots/countdown.png)

![Your booked ticket](screenshots/your-ticket.png)

## 3. At the door, and cancelling

- Show the 8-character code from the event page or from **Me → My tickets** to the organizer.
- Can't go? Open the event and tap **Cancel booking** before it starts. Your ticket goes back on sale for someone else.

## 4. My tickets

**Me → My tickets** lists your tickets, upcoming ones first and past ones after. Past tickets show "Checked in" if you attended.

![My tickets](screenshots/my-tickets.png)

![New account without tickets](screenshots/empty-tickets.png)

## 5. For organizations

Organization accounts (societies and offices) are set up by the Campus Notes admins.

- **Create an event:** Me → **New event** (My events has a **New event** button too). Enter the title, description, place, start and end times, the time tickets go on sale, the number of tickets, who may attend (your university or all universities), and an optional cover image. Times are Hong Kong time.
- **Edit:** you can change any detail. The number of tickets cannot go below the number already booked.
- **Cancel:** on the event page, **Cancel event**. People who booked keep their ticket as a record, and booking stops.
- **Check people in:** open **Attendees**, type the code the attendee shows you, and tap **Check in**. The list shows who has arrived.
- **My events** shows every event you created, with tickets booked and people checked in.

![New event form](screenshots/create-event.png)

![Attendee list and check-in](screenshots/attendees.png)

![Organizer dashboard](screenshots/my-events.png)

## 6. Messages you may see

| Message | Why |
|---|---|
| Tickets go on sale at 10:00 | The release time has not come yet. |
| Sold out | No tickets are left. |
| You already have a ticket | One ticket per person. |
| Booking has closed | The event has started. |
| This event was cancelled | The organizer cancelled it. |
| 12 tickets are already booked | (Organizers) The new number of tickets is lower than the bookings. |
| No ticket with that code | (Organizers) The code is mistyped or belongs to another event. |

## 7. Try it with the demo accounts

All demo accounts use the password `campus123` (in development, the login page lets you pick one).

1. Log in as **newbie0hk** → Events → **Film night** → **Book a ticket**. Note the code.
2. Log in as **filmsoc00** (HKU Film Society) → Me → My events → Film night → **Attendees** → enter Newbie's code → **Check in**.
3. Log in as **wing0cuhk** (CUHK): the "Director Q&A (HKU members)" event does not appear.
4. Log in as **mandy0hku** → Events → **Director Q&A**: watch the countdown (it opens 2 hours after the database was reset).
5. In a throwaway development database, run `npm run demo:race` while the server is running: 200 simulated students try to book 50 tickets at the same moment; exactly 50 succeed. This replaces every ticket for event 1 and creates racer accounts; the script and server must use the same database. `npm run db:reset` restores seed data afterward and removes all development changes.
