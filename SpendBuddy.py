print("Hello, Welcome to SpendBuddy, track every cent")
print("")
print("Menu:")
print('1. Add a new expense')
print('2. View all expenses')
print('3. Calculate total and average expense')
print('4. Clear all expenses')
print('5. Exit')
expense = []
total = 0
count = 0
while True:
    choice = input("Please choose from options 1 to 5: ")
    if choice == "5":
        print("Exiting the Daily Expense Tracker. Goodbye!")
        break
    elif choice == "1":
        i = float(input("Please enter your expense amount: R "))
        expense.append(i)
        print("Expense added successfully!")
    elif choice == "2":

        if len(expense) == 0:
            print("No expenses recorded yet.")


        else:
            print(f"Your expenses:")
            for i in range(len(expense)):
                print(f"{i + 1}. {expense[i]}")
    elif choice == "3":
        if len(expense) == 0:
            print("No expenses recorded yet.")
        else:
            for i in expense:
                total += i
                count += 1
                Average_expense = total / count

            print(f"Total expense:R {total}")
            print(f"Average expense:R {Average_expense}")
    elif choice == "4":
        print("All expenses cleared.")
        expense.clear()
    else:
        print("Invalid choice. Please try again.")


