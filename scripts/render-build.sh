#!/usr/bin/env sh
# Render build — must install devDependencies (Nest CLI + TypeScript + Prisma CLI).
set -eu
cd "$(dirname "$0")/.."

echo "Installing dependencies (including dev)..."
npm ci --include=dev

echo "Prisma generate..."
npx prisma generate

echo "Nest build..."
npm run build

echo "Database migrations..."
npx prisma migrate deploy

echo "Render build complete."