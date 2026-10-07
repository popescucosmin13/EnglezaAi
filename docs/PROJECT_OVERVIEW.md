# EnglezaAI — Project Overview

## What is this project?

EnglezaAI is an English learning application for Romanian speakers, with a React web/PWA client, an Expo mobile client and a Vercel API backend. This repository contains the actual product implementation and tests.

## Problem

Learners need speaking practice, feedback they understand, and opportunities to revisit recurring mistakes. Separate vocabulary lists and generic conversations do not automatically connect these activities.

## Solution

Voice conversations feed a learning loop: transcription, tutor responses, correction and session analysis, followed by targeted practice and spaced repetition. Explanations are available in Romanian. Profiles and learning history are persisted through Firebase.

## Target users

Romanian speakers practising everyday and professional English. The code includes conversation scenarios, a level assessment, grammar practice and an IT-oriented learning path.

## Main features

- Voice tutor with immediate or end-of-session correction and hands-free controls.
- English Mirror reformulations, mistake tracking and active vocabulary practice.
- Grammar course, pronunciation assessment, listening and speaking exercises.
- Adaptive microlearning, daily stories, timed voice challenge and weekly assessment.
- Progress reports, learning reminders, subscription gating and administration.
- Mobile account creation and email verification; web login and account recovery.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). Web and mobile share 60 explicitly listed files. Platform-specific audio, navigation, storage and UI remain separate. Authenticated API functions call external AI, speech, email and subscription services.

## Technology choices

React/Vite builds the web client. Expo/React Native provides native navigation, audio, notifications and purchases. Firebase provides identity and document storage. Vercel hosts API functions. Vitest tests educational logic, request authorization, acquisition and subscription helpers.

## Important technical decisions

- A manifest checks shared source files before the web build and mobile typecheck.
- Provider credentials remain in server environment variables.
- Firebase ID tokens authorize API requests; admin checks run server-side.
- Distributed quotas use Upstash when configured; the memory fallback is per instance.
- Speech recognition, model responses and speech playback are separate stages.
- Web pages load lazily; the service worker receives a build-specific cache version.

## Security considerations

Transcripts, email addresses, profiles and subscription data are private runtime data. The public package excludes environment files, browser exports, signing material and compiled distributions. See [SECURITY.md](SECURITY.md).

## Challenges

The code addresses web/native differences in audio, onboarding, email verification, offline storage, structured model output and subscription state. Tests cover portions of these flows; production services and physical devices still require integration testing.

## Future improvements

Planned suggestions, not delivered features: isolated CI fixtures, reproducible public demo configuration, screenshots with synthetic data, and a complete asset provenance and project license review.
