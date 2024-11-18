#!/bin/bash

# Exit on error
set -e

# Deploy Smart Contracts
echo "Deploying Smart Contracts..."
cd contracts
anchor deploy --provider.cluster mainnet

# Build and Push Backend Docker Image
echo "Building Backend Docker Image..."
cd ../backend
docker build -t yourdockerhub/rumble-backend:latest .
docker push yourdockerhub/rumble-backend:latest

# Deploy Backend to Kubernetes
echo "Deploying Backend to Kubernetes..."
kubectl apply -f k8s/backend-deployment.yaml

# Build and Push AI Service Docker Image
echo "Building AI Service Docker Image..."
cd ../ai-service
docker build -t yourdockerhub/rumble-ai:latest .
docker push yourdockerhub/rumble-ai:latest

# Deploy AI Service to Kubernetes
echo "Deploying AI Service to Kubernetes..."
kubectl apply -f k8s/ai-service-deployment.yaml

# Build and Deploy Frontend
echo "Building Frontend Application..."
cd ../frontend
npm run build
vercel deploy --prod

echo "Deployment Complete!"
