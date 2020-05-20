version: 2.0
jobs:
  build:
    docker:
      - image: circleci/node:lts
    steps:
      - checkout
      - restore_cache:
          key: lint-node-modules-{{ checksum ".lint/package-lock.json" }}
      - run:
          name: Install the Markdown Linter
          command: "cd .lint && npm install"
      - run:
          name: Run the Markdown Linter
          command: ".lint/lint.sh ."
      - save_cache:
          key: lint-node-modules-{{ checksum ".lint/package-lock.json" }}
          paths:
            - .lint/node_modules
