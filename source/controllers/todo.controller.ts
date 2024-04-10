import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { notifylog } from "../lib/notifylog";

export const createTodoController = async (request: Request, response: Response) => {
  const userId = request.headers['x-user-id']

  if(!userId) {
    return response.status(403).send({
      error: 'Not authorized'
    })
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId as string
    },
    select: {
      id: true,
      name: true,
      email: true,
      stripeSubscriptionId: true,
      stripeSubscriptionStatus: true,
      _count: {
        select: {
          todos: true
        }
      }
    }
  })

  if(!user) {
    return response.status(403).send({
      error: 'Not authorized'
    })
  }

  const hasQuotaAvailable = user._count.todos <= 5
  const hasActiveSubscription = !!user.stripeSubscriptionId

  if(!hasQuotaAvailable && !hasActiveSubscription && user.stripeSubscriptionStatus !== 'active') {
    return response.status(403).send({
      error: 'Not quota available. Please upgrade your plan.'
    })
  }

  const { title } = request.body

  const todo = await prisma.todo.create({
    data: {
      title,
      ownerId: user.id
    }
  })

  return response.status(201).send(todo)
}