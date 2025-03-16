TERMINAL=$(tty)
HEIGHT=20
WIDTH=50
CHOICE_HEIGHT=5

# Get the databases from the postgres container and list the names to console
POSTGRES_PASSWORD=$(cat $POSTGRES_PASSWORD_FILE | tr -d '\n')
DATABASES=$(PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -c "\l" -d postgres -t | cut -d'|' -f1 | sed -e 's/^[[:space:]]*//' )

# reverse the order of the databases
DATABASES=$(echo $DATABASES | tr " " "\n" | tac | tr "\n" " ")

#prepare choices for dialog
CHOICES=""

for DATABASE in $DATABASES
do
    CHOICES="$CHOICES $DATABASE ''"
done

echo $CHOICES

# Show a dialog to select the database to list the experiments for
CHOICE=$(dialog --title "Select an experiment database to join" --menu "Choose a database to list the experiments for" $HEIGHT $WIDTH $CHOICE_HEIGHT $CHOICES 2>&1 >$TERMINAL)

clear

if [ -n "$CHOICE" ];
then
    echo "Joining experiment $CHOICE"
else
    echo "No database selected"
    exit 1
fi

# get the experiment and timestamp from the database ex: userdiff_manual___2024_08_06_02_34_07
# get timestamp by reversing the string and splitting it at the last underscore

TIMESTAMP=$(echo $CHOICE | rev | cut -d'_' -f1-6 | rev)

echo "Joining experiment $CHOICE"

# join the experiment
bash experiment-stop.sh
bash experiment-join.sh $TIMESTAMP $CHOICE

