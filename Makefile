SHELL := /bin/bash
.PHONY: test lint build clean help

help:
	@echo "Targets:"
	@echo "  test    - run unit and integration tests"
	@echo "  lint    - run linter (if available)"
	@echo "  build   - build production artifacts (if applicable)"
	@echo "  clean   - remove temp/build artifacts"

test:
	@echo "No test runner configured; use npm test or node scripts directly."

lint:
	@echo "No linter configured."

build:
	@echo "Nothing to build."

clean:
	rm -rf tmp/ coverage/ dist/ build/ 2>/dev/null || true
