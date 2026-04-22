FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY . .

EXPOSE 8080

CMD ["sh", "-c", "javac -cp .:lib/postgresql-42.7.5.jar Main.java controller/TaskController.java service/TaskManager.java repository/DatabaseManager.java model/Task.java model/TaskHistory.java && java -cp .:lib/postgresql-42.7.5.jar Main"]