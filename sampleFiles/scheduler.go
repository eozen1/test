package scheduler

import (
	"fmt"
	"sync"
	"time"
)

type TaskPriority int

const (
	Low    TaskPriority = 0
	Normal TaskPriority = 1
	High   TaskPriority = 2
	Urgent TaskPriority = 3
)

type Task struct {
	ID       string
	Name     string
	Priority TaskPriority
	RunAt    time.Time
	Fn       func() error
}

type Scheduler struct {
	mu       sync.Mutex
	tasks    []*Task
	running  bool
	stopChan chan struct{}
}

func NewScheduler() *Scheduler {
	return &Scheduler{
		tasks:    make([]*Task, 0),
		stopChan: make(chan struct{}),
	}
}

func (s *Scheduler) AddTask(task *Task) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Insert sorted by priority (higher first), then by RunAt (earlier first)
	inserted := false
	for i, existing := range s.tasks {
		if task.Priority > existing.Priority ||
			(task.Priority == existing.Priority && task.RunAt.Before(existing.RunAt)) {
			s.tasks = append(s.tasks[:i], append([]*Task{task}, s.tasks[i:]...)...)
			inserted = true
			break
		}
	}
	if !inserted {
		s.tasks = append(s.tasks, task)
	}
}

func (s *Scheduler) RemoveTask(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, task := range s.tasks {
		if task.ID == id {
			s.tasks = append(s.tasks[:i], s.tasks[i+1:]...)
			return true
		}
	}
	return false
}

func (s *Scheduler) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	go s.run()
}

func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}
	s.running = false
	close(s.stopChan)
}

func (s *Scheduler) run() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case now := <-ticker.C:
			s.processReadyTasks(now)
		}
	}
}

func (s *Scheduler) processReadyTasks(now time.Time) {
	s.mu.Lock()
	var readyTasks []*Task
	var remaining []*Task

	for _, task := range s.tasks {
		if !task.RunAt.After(now) {
			readyTasks = append(readyTasks, task)
		} else {
			remaining = append(remaining, task)
		}
	}
	s.tasks = remaining
	s.mu.Unlock()

	for _, task := range readyTasks {
		if err := task.Fn(); err != nil {
			fmt.Printf("Task %s failed: %v\n", task.ID, err)
		}
	}
}

func (s *Scheduler) PendingCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.tasks)
}
