# Identity: user guide

Your Campus Notes account: joining with your university e-mail, logging in, resetting a forgotten password, and the **Me** tab with your counts, profile and settings.

Screenshots go in `docs/modules/identity/img/` when the pages are built; the placeholders below name the file each one should have.

## 1. Joining Campus Notes

Only students and organizations of **HKU, CUHK and HKUST** can join, and you prove it with your university e-mail address. These addresses are accepted:

| University | E-mail ends with |
|---|---|
| HKU | `@hku.hk`, `@connect.hku.hk` |
| CUHK | `@cuhk.edu.hk`, `@link.cuhk.edu.hk` |
| HKUST | `@ust.hk`, `@connect.ust.hk` |

The address must end exactly like this: a department address such as `name@cs.hku.hk` is not accepted, and neither is a private address such as Gmail. Your address also decides your university, which matters for posts shared with "my university" only.

1. On the login page, tap **New here? Join with your university e-mail**.
2. Enter your university e-mail and tap **Send code**.
3. Open your e-mail: a message "Your Campus Notes code" contains a 6-digit code. It is valid for 10 minutes. (In the demo, e-mails appear in the developer mailbox instead.)
4. Enter the code, choose a password of at least 8 characters, type it again, and tap **Create account**.
5. You are logged in and on the feed. The welcome message tells you your **handle**, such as `k3m9x2p7a`.

Your handle is your public id: 9 random letters and digits, given to you once and never changed. Other people see it only when you choose to show it (§6). Your e-mail address is never shown to other users.

No code? Wait a minute and tap **Send a new code**. Only the newest code works, so use the one from the latest e-mail.

*(screenshot to add: `img/register.png`, `img/verify.png`)*

## 2. Logging in and out

- **Log in** with your university e-mail and your password. If a page sent you to the login page, you go back to that page afterwards.
- **Log out:** Me → **Log out** (at the bottom).

Everything except the login, sign-up and password pages and About, Contact, Terms and Privacy needs you to be logged in.

*(screenshot to add: `img/login.png`)*

## 3. Forgot your password

1. On the login page, tap **Forgot password?**
2. Enter your e-mail and tap **Send code**. The page always says "If an account exists for that e-mail, we sent a code.", so nobody can use it to find out who has an account.
3. Enter the code from the e-mail and your new password twice, then tap **Set new password**. You are logged in with the new password.

The same rules apply as for joining: 10 minutes, 5 tries, a new code after a minute.

## 4. The Me page

The **Me** tab shows your avatar, your handle and your university, then four numbers. Tap a number to open the list behind it:

| Number | What it counts |
|---|---|
| **My posts** | Your posts, including anonymous ones (only you see this list). Deleted posts and posts hidden by a moderator are not counted. |
| **Watching** | Posts you watch (the star). |
| **Comments** | Your comments, except deleted ones and comments on posts that were deleted or hidden. A comment hidden by a moderator still counts. |
| **Viewed** | Posts in your history. "Clear history" sets it back to 0. |

Below the numbers is the menu:

- My posts, Watching, My comments, History, Liked, My tickets
- Profile, Settings
- About, Contact
- Terms, Privacy
- **Organizations and admins** also see My events and New event.
- **Admins** also see Reports, Announcements and Users.
- Log out

*(screenshot to add: `img/me.png`, `img/me-menu.png`)*

## 5. Your profile

**Me → Profile** shows your handle, your e-mail address (only you see it here), your university and the date you joined.

- **Avatar:** pick one from the set and tap **Save**. It is shown on your Me page and your public page. Each post gets its own random avatar, so your avatar never gives away your anonymous posts.
- **Bio:** up to 160 characters, shown on your public page. You can leave it empty.

Organizations also see their name and description. To change them, ask an admin.

*(screenshot to add: `img/profile.png`)*

## 6. Settings

**Me → Settings** has four switches and a password form.

| Switch | On | Off |
|---|---|---|
| Post anonymously by default | New posts start with "Show my handle" off. | New posts start with your handle shown. |
| Share new posts with all universities by default | New posts start as visible to all three universities. | New posts start as visible to your university only. |
| Notify me about comments | You are told about comments on your posts, replies to your comments, and comments on posts you watch. | No new comment notifications. |
| Notify me about likes | You are told when someone likes your post. | No new like notifications. |

The first two only choose how the compose page starts; you can still change both on every post. Switching notifications off stops new ones; the ones you already have stay.

**Change password:** enter your current password, then the new one twice, and tap **Change password**.

*(screenshot to add: `img/settings.png`)*

## 7. About, Contact, Terms and Privacy

These four pages are at the bottom of the Me menu and can also be read without logging in.

- **About:** what Campus Notes is. It is a student project for the COMP3278 database course at HKU and is not affiliated with Triple Uni.
- **Contact:** the project team’s GitHub issues page for bugs, ideas and questions. To report a post or comment, use **Report** on it.
- **Terms:** be kind; no harassment, no doxxing, no spam. Moderators may hide content that breaks the rules and suspend accounts.
- **Privacy:** what is stored and who sees it. Anonymous posts hide your handle from other users, but admins can see who wrote a post when they handle a report. Campus Notes runs as a local demo.

## 8. For admins: managing users

**Me → Users** lists accounts. Search by the start of a handle or any part of an e-mail address. Each account in the list shows its e-mail, university, role, when it joined and when it last logged in, with these buttons:

- **Ban:** the person is logged out at once and cannot log in again ("This account is suspended."). Their posts stay; hide individual posts through Reports. You cannot ban yourself.
- **Unban:** the person can log in again.
- **Make organization** (student accounts only): turns the account into an organization with the display name you enter, such as "HKU Chess Club". The organization can then create events, and its posts that show its name show the display name.

*(screenshot to add: `img/admin-users.png`)*

## 9. Messages you may see

| Message | Why |
|---|---|
| Enter a valid e-mail address. | The address is mistyped. |
| Use your HKU, CUHK or HKUST e-mail address. | The address is not one of the university addresses in §1. |
| This e-mail is already registered. Log in or reset your password. | An account already uses this address. |
| Please wait a minute before asking for another code. | You can ask for a new code once a minute. |
| Enter the 6-digit code. | The code must be 6 digits. |
| Wrong code. 3 tries left. | The code is not the one in the newest e-mail. |
| Too many wrong tries. Request a new code. | 5 wrong tries use a code up. |
| This code has expired. Request a new one. | Codes are valid for 10 minutes. |
| This code is no longer valid. Request a new one. | The code was already used, or there is no code for this address. |
| Use at least 8 characters. | Passwords need 8 characters or more. |
| Use at most 72 characters. | Longer passwords are not supported. |
| The passwords do not match. | The two password fields differ. |
| Wrong e-mail or password. | The e-mail or the password is wrong (the page does not say which). |
| This account is suspended. | An admin banned the account. |
| If an account exists for that e-mail, we sent a code. | Always shown after "Forgot password", whether or not the account exists. |
| Your current password is wrong. | (Settings) The current password did not match. |
| Pick an avatar. | (Profile) Choose one of the avatars shown. |
| You cannot ban yourself. | (Admins) |
| Only a student account can become an organization. | (Admins) The account is already an organization or an admin. |

## 10. Try it with the demo accounts

All demo accounts use the password `campus123` (in development, the login page also lists them so you can log in with one tap).

1. Log out, tap **New here?**, and join as `yourname@connect.hku.hk`. Open the developer mailbox (`/dev/mailbox`) to read the code, enter it, and choose a password. Note your new handle on the feed.
2. Try to join as `yourname@cs.hku.hk` or `yourname@gmail.com`: both are refused.
3. Log in as **mandy@connect.hku.hk**. Me shows 3 posts, 2 watching, 4 comments and 4 viewed. Open Settings, turn off "Post anonymously by default", and open + (compose): "Show my handle" is now on.
4. Log in as **filmsoc@hku.hk** (HKU Film Society): the Me menu has My events and New event; Profile shows the society's name and description.
5. Log in as **admin@hku.hk** → Me → Users → search `jason` → **Ban**. Then try to log in as **jason@connect.ust.hk**: "This account is suspended." Unban him again afterwards.
6. Log in as **newbie@connect.hku.hk**: every count on the Me page is 0.
