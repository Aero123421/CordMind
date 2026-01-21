<div align="center">

# 🧠 CordMind
### Discord AI Manager

**Secure, natural language administration for your Discord server.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-43853d?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Status](https://img.shields.io/badge/Status-Alpha-ff7a59?style=for-the-badge)](https://github.com/)

**English** | [日本語](README.ja.md)

</div>

---

## 📖 Overview
**CordMind** is a self-hosted bot that turns natural language requests into safe Discord administrative actions.
Instead of clicking through menus to manage permissions, channels, and roles, just ask: *"Create a private channel for moderators."*

---

## 🚀 Setup Guide

Follow these steps sequentially to get up and running. No jumping around required.

### Step 1: Discord Developer Portal Setup
First, create the bot account and get your credentials.

1. Go to the **[Discord Developer Portal](https://discord.com/developers/applications)** and create a `New Application`.
2. **Create the Bot**:
   - Click `Bot` in the left menu, then click `Add Bot`.
   - **Copy the Token**. Save this; you will need it for the `.env` file later.
3. **Enable Privileged Intents** (Crucial):
   - Scroll down to the `Privileged Gateway Intents` section on the Bot page.
   - Enable all three:
     - ✅ **Presence Intent**
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**
   - Click `Save Changes`.
4. **Invite the Bot**:
   - Click `OAuth2` > `URL Generator` in the left menu.
   - **Scopes**: Check `bot` and `applications.commands`.
   - **Bot Permissions**: Check `Administrator` for the easiest setup.
     - *(Or manually select: Manage Channels, Manage Roles, Manage Threads, Send Messages, View Channels).*
   - Copy the generated URL, open it in your browser, and invite the bot to your server.
5. **Get Client ID**:
   - Go to `OAuth2` (General) in the left menu.
   - Copy the **Client ID**.

### Step 2: Project Configuration
Configure the project files locally.

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd discordAIManager
   ```
2. **Create Environment File**:
   Copy the example file to `.env`.
   ```bash
   cp .env.example .env
   ```
3. **Edit .env**:
   Fill in the values you got in Step 1.
   ```env
   # Token from Step 1-2
   DISCORD_TOKEN=your_bot_token_here
   
   # Client ID from Step 1-5
   DISCORD_CLIENT_ID=123456789012345678

   # Encryption Key (Generate using the command below)
   DISCORDAI_ENCRYPTION_KEY=
   
   # Database (Leave as is if using Docker)
   DATABASE_URL=postgresql://postgres:postgres@db:5432/discordai?schema=public
   ```
4. **Generate Encryption Key**:
   Run one of the following commands to generate a secure key, and paste it into `DISCORDAI_ENCRYPTION_KEY` in your `.env` file.
   ```bash
   # Linux / Mac / WSL
   openssl rand -base64 32
   
   # Windows (PowerShell)
   [Convert]::ToBase64String((1..32|%{[byte](Get-Random -Max 256)}))
   ```

### Step 3: Launch (Docker)
Start the application.

```bash
docker compose up --build
```
You should see `Logged in as CordMind#xxxx!` in the logs.

### Step 4: Verify
Go back to your Discord server.

1. Mention the bot in any channel:
   > `@CordMind Hello!`
2. If the bot creates a thread and replies, you are all set! 🎉

---

## 🎮 Usage

1.  **Request**: Mention the bot (`@CordMind`) with your request.
    > `@CordMind Create a private channel for moderators.`
2.  **Threaded conversation**: The bot creates a dedicated thread. Continue there without mentions.
3.  **Plan & Review**: For destructive changes, the bot shows a confirmation with `Accept` / `Reject`.
    - Only the requester can click `Accept`.
4.  **Manage Settings**: Use interactive menus.
    - `/discordaimanage setup`: First-time guided setup (language → provider → API key → model).
    - `/discordaimanage setting`: Change settings anytime (interactive menu).
    - `Guided setup` is also available from the settings menu.

---

## 🤖 LLM Providers & Models

- API keys are stored **per provider**.
- The model list is fetched from each provider API and cached for 24 hours.
- If no API key is set, fallback model lists are used.
- Switching providers resets the selected model (pick again).

---

## 🛠️ Troubleshooting

*   **Bot doesn't reply in threads**:
    *   Double-check that **Message Content Intent** is enabled in the Discord Developer Portal.
*   **Missing bot permissions**:
    *   Ensure the bot role has the required permissions (Manage Channels, Manage Roles, Manage Threads, etc.).
*   **Startup fails**:
    *   Ensure `DISCORDAI_ENCRYPTION_KEY` is a valid 32-byte Base64 string.
*   **Database errors**:
    *   Try resetting the volume: `docker compose down -v` then `docker compose up`.

---

<div align="center">
Created with ❤️ for Discord Admins
</div>
