set -o allexport
source $POSTGRES_PASSWORD_FILE
set +o allexport
npm run start --watch
