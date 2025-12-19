import { CreateUserDTO } from '../types/user.js'

const users: CreateUserDTO[] = []

export function getUsers(name: string) {
    return users
}
export function addUsers(request: CreateUserDTO) {
    const id = Math.round(Math.random() * 100000)
    users.push({ ...request, id })
    return true
}
