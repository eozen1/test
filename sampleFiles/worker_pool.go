package scheduler

import (
	"fmt"
	"sync"
)

type WorkerPool struct {
	size    int
	jobs    chan func() error
	results chan error
	wg      sync.WaitGroup
}

func NewWorkerPool(size int, bufferSize int) *WorkerPool {
	return &WorkerPool{
		size:    size,
		jobs:    make(chan func() error, bufferSize),
		results: make(chan error, bufferSize),
	}
}

func (wp *WorkerPool) Start() {
	for i := 0; i < wp.size; i++ {
		wp.wg.Add(1)
		go wp.worker(i)
	}
}

func (wp *WorkerPool) Submit(job func() error) {
	wp.jobs <- job
}

func (wp *WorkerPool) Stop() {
	close(wp.jobs)
	wp.wg.Wait()
	close(wp.results)
}

func (wp *WorkerPool) Results() <-chan error {
	return wp.results
}

func (wp *WorkerPool) worker(id int) {
	defer wp.wg.Done()

	for job := range wp.jobs {
		err := job()
		if err != nil {
			fmt.Printf("Worker %d: job failed: %v\n", id, err)
		}
		wp.results <- err
	}
}

func (wp *WorkerPool) PendingJobs() int {
	return len(wp.jobs)
}

func (wp *WorkerPool) PoolSize() int {
	return wp.size
}
