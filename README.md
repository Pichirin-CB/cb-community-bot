
██████╗ ███████╗ █████╗ ██████╗ ███╗   ███╗███████╗ 
██╔══██╗██╔════╝██╔══██╗██╔══██╗████╗ ████║██╔════╝ 
██████╔╝█████╗  ███████║██║  ██║██╔████╔██║█████╗   
██╔══██╗██╔══╝  ██╔══██║██║  ██║██║╚██╔╝██║██╔══╝   
██║  ██║███████╗██║  ██║██████╔╝██║ ╚═╝ ██║███████╗ 
╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝╚══════╝ 

---------------------------------------------------------------------------

# CB Community — Technical Documentation

**Official CB Studios Discord Community Bot**

Version: `1.0.0`  
Author: **CB Studios**  
Type: **Discord Community Bot**

---------------------------------------------------------------------------

# Resource Overview

CB Community is the official Discord community bot developed for the
CB Studios ecosystem.

The bot provides centralized tools for community management, moderation,
support workflows, automation, temporary voice channels, welcome systems,
self-roles, logging, status utilities and administrative operations.

This documentation is intended for administrators, developers and staff
members responsible for deploying, configuring or maintaining CB Community.

---------------------------------------------------------------------------

# Features

### 🛡️ Moderation

• Server moderation utilities  
• Permission-aware administrative commands  
• Moderation and management tools  

### 🎫 Support & Tickets

• Ticket creation and management  
• Ticket claiming  
• Ticket closing and reopening  
• Transcript workflows  
• Staff support utilities  

### 👋 Welcome System

• Automated member welcome messages  
• Configurable welcome behavior  
• Automatic role assignment  

### 🎭 Self Roles

• Interactive role selection  
• Role management utilities  
• Protected-role handling  

### 🔊 Temporary Voice Channels

• Temporary voice channel creation  
• Automatic channel management  
• Cleanup of inactive temporary channels  

### 📢 Community Automation

• Automated Discord workflows  
• Community announcements  
• Discord event handling  
• Server automation tools  

### 📊 Status & Utilities

• Bot status information  
• Runtime information  
• Uptime information  
• Health and diagnostic utilities  

### 🧰 Developer Tools

• Private developer commands  
• Module information  
• Health checks  
• Operational diagnostics  

### 💾 Persistent Storage

• SQLite database  
• Automatic database migrations  
• Persistent community configuration  
• Local data storage  

---------------------------------------------------------------------------

# Requirements

The following components are required to run CB Community:

• Node.js  
• npm  
• A Discord application  
• A Discord bot  
• A Discord server where the bot will operate  

The bot must have the Discord permissions required by the modules
enabled on the server.

---------------------------------------------------------------------------

# Installation

### 1. Download the Repository

Clone or download the CB Community repository.

```bash
git clone https://github.com/Pichirin-CB/cb-community-bot.git
```

### 2. Install Dependencies

Open a terminal inside the project directory and run:

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file using `.env.example` as the template.

Example:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

DATABASE_PATH=./data/cb_community.sqlite
NODE_ENV=development
LOG_LEVEL=info
BOT_PRESENCE=Con la comunidad 🎮
```

Additional environment variables may be required depending on the
enabled features and modules.

### 4. Deploy Discord Commands

Deploy the slash commands:

```bash
npm run deploy:commands
```

On Windows, you can also use:

```text
deploy-commands.bat
```

### 5. Build the Project

```bash
npm run build
```

### 6. Start the Bot

```bash
npm start
```

---------------------------------------------------------------------------

# Configuration

Configuration is primarily handled through environment variables.

The main configuration file is:

```text
.env
```

Use `.env.example` as the reference configuration.

### Discord Configuration

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
```

### Application Configuration

```env
NODE_ENV=development
LOG_LEVEL=info
BOT_PRESENCE=Con la comunidad 🎮
```

### Database Configuration

```env
DATABASE_PATH=./data/cb_community.sqlite
```

Never commit `.env` files containing private credentials.

---------------------------------------------------------------------------

# Database

CB Community uses SQLite for persistent local storage.

Default database:

```text
data/cb_community.sqlite
```

Database migrations are handled by the project's migration system.

To manually execute migrations:

```bash
npm run db:migrate
```

### Database Migration Warning

If upgrading an existing installation, always create a backup of the
current database before changing database paths or applying structural
changes.

Never delete an existing production database during an update.

---------------------------------------------------------------------------

# Logs

Application logs are stored inside:

```text
logs/
```

The main application log is:

```text
logs/cb-community.log
```

Logs should be reviewed when troubleshooting startup errors,
Discord connection problems or module failures.

---------------------------------------------------------------------------

# Development

Run the bot in development mode:

```bash
npm run dev
```

Development mode is intended for local development and testing.

---------------------------------------------------------------------------

# Build

Compile the TypeScript project:

```bash
npm run build
```

The compiled application is generated in the project's distribution
directory.

---------------------------------------------------------------------------

# Validation

Before deploying changes, run:

```bash
npm run build
npm run lint
npm run test
```

All available checks should complete successfully before deploying
a modified production build.

---------------------------------------------------------------------------

# Windows Utilities

The repository includes Windows helper scripts for common operations.

```text
start.bat
stop.bat
status.bat
deploy-commands.bat
test.bat
```

These scripts are intended to simplify local administration of
CB Community on Windows systems.

---------------------------------------------------------------------------

# Updating CB Community

To update an existing installation:

### 1. Stop the Bot

Stop the currently running CB Community process.

### 2. Backup the Database

Create a backup of:

```text
data/cb_community.sqlite
```

### 3. Update the Source Files

Replace the project files with the new version.

### 4. Install Dependencies

```bash
npm install
```

### 5. Apply Database Migrations

```bash
npm run db:migrate
```

### 6. Build the Project

```bash
npm run build
```

### 7. Deploy Commands if Required

```bash
npm run deploy:commands
```

### 8. Start the Bot

```bash
npm start
```

---------------------------------------------------------------------------

# Troubleshooting

## Bot Does Not Start

Verify:

• `.env` exists
• `DISCORD_TOKEN` is configured
• `DISCORD_CLIENT_ID` is configured
• `DISCORD_GUILD_ID` is configured when required
• Dependencies are installed
• The project builds successfully

Run:

```bash
npm run build
```

and review the resulting error output.

## Slash Commands Are Missing

Verify that the commands have been deployed:

```bash
npm run deploy:commands
```

Also verify that the bot is installed in the correct Discord server
with the required permissions.

## Database Errors

Verify that:

```text
data/
```

exists and that the application has permission to create or access
the SQLite database.

Do not delete the database before creating a backup.

## Module Is Not Working

Verify:

• The bot is online
• The required Discord permissions are available
• The corresponding configuration is correct
• No startup or runtime errors are present in the logs

---------------------------------------------------------------------------

# Technical Notes

Do not rename internal files, directories or modules unless you understand
their references inside the project.

Changing project paths or database locations may require corresponding
configuration changes.

Do not modify production database files manually.

Always create a backup before performing major updates or migrations.

---------------------------------------------------------------------------

# Security

Never commit or publicly expose:

• Discord bot tokens
• `.env` files containing secrets
• Production databases
• Private credentials
• Server-specific sensitive configuration

Use environment variables for sensitive configuration.

If a Discord bot token is exposed, immediately revoke and regenerate
the token through the Discord Developer Portal.

---------------------------------------------------------------------------

# Support

When requesting support, provide as much of the following information
as possible:

```text
Bot Name:
Version:
Node.js Version:
Operating System:
Discord Server:
Command / Module:
Error Message:
Relevant Logs:
Description:
Steps to Reproduce:
```

Do not include:

• Discord bot tokens
• Passwords
• Private credentials
• Other sensitive information

---------------------------------------------------------------------------

# CB Studios

CB Community is part of the **CB Studios** ecosystem.

CB Studios develops FiveM and RedM resources, community tools,
server infrastructure and development solutions.

### Official Links

**Store**

https://pichirin-cb.tebex.io/

**Documentation**

https://docs.pichirincb.com

**Discord**

https://discord.gg/hsx6AvBg5s

**GitHub**

https://github.com/Pichirin-CB/cb-community-bot

---------------------------------------------------------------------------

 ██████╗██████╗     ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗ ███████╗ 
██╔════╝██╔══██╗    ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗██╔════╝ 
██║     ██████╔╝    ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║███████╗ 
██║     ██╔══██╗    ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║╚════██║ 
╚██████╗██████╔╝    ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝███████║ 
 ╚═════╝╚═════╝     ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝ ╚══════╝ 

Store -> https://pichirin-cb.tebex.io/

Documentation -> https://docs.pichirincb.com

Support Discord -> https://discord.gg/hsx6AvBg5s

---------------------------------------------------------------------------

End of documentation
