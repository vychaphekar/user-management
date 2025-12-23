.PHONY: test build lint

test:
	cd apps/user-service && npm test

lint:
	cd apps/user-service && npm run lint

build:
	cd apps/user-service && npm run build
	cd apps/cognito-triggers/pre-token-generation && npm run build
