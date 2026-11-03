import { graphql } from '../../gql';
import type { ExpensesQuery } from '../../gql/graphql';

export const ExpensesDocument = graphql(`
  query Expenses($id: ID!) {
    trip(id: $id) {
      id
      currency
      expenseSummary {
        total
        viewerPaid
        viewerBalance
        expenseCount
      }
      expenses {
        id
        description
        category
        amount
        spentAt
        viewerShare
        isSettlement
        paidBy {
          id
          name
        }
        splits {
          amount
          user {
            id
            name
          }
        }
      }
      balances {
        amount
        user {
          id
          name
        }
      }
      settlements {
        amount
        from {
          id
          name
        }
        to {
          id
          name
        }
      }
    }
  }
`);

export const AddExpenseDocument = graphql(`
  mutation AddExpense($input: AddExpenseInput!) {
    addExpense(input: $input) {
      id
    }
  }
`);

export const DeleteExpenseDocument = graphql(`
  mutation DeleteExpense($id: ID!) {
    deleteExpense(id: $id)
  }
`);

export type ExpensesTrip = NonNullable<ExpensesQuery['trip']>;
export type ExpenseRow = ExpensesTrip['expenses'][number];
