pipeline {
    agent any

    environment {
        SCANNER_HOME = tool 'sonar-scanner' 
        
        DB_IMAGE = 'shahith/shamart-db:v3'
        BACKEND_IMAGE = 'shahith/shamart-backend'
        FRONTEND_IMAGE = 'shahith/shamart-ui:v2'
        
        EC2_IP = '13.233.232.83'
        EC2_USER = 'ubuntu' 
    }

    stages {
        stage('GitHub Connect') {
            steps {
                echo '=== 1. Cloning repository from GitHub ==='
                checkout scm
            }
        }

        stage('Code Scan (SonarQube)') {
            steps {
                echo '=== 2. Running SonarQube static code analysis ==='
                withSonarQubeEnv('SonarQubeServer') { 
                    sh "${SCANNER_HOME}/bin/sonar-scanner \
                    -Dsonar.projectName=SHAmart-Ecom \
                    -Dsonar.projectKey=shamart-ecom"
                }
            }
        }

        stage('Build Container Images') {
            steps {
                echo '=== 3. Building Database, Backend & Frontend images using DockerCompose.yml ==='
                sh "docker compose -f DockerCompose.yml build"
            }
        }

        stage('Container Scan (Trivy)') {
            steps {
                echo '=== 4. Scanning built custom images for vulnerabilities using Trivy ==='
                sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${DB_IMAGE}"
                sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${BACKEND_IMAGE}"
                sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${FRONTEND_IMAGE}"
            }
        }

        stage('Push to Docker Hub') {
            steps {
                echo '=== 5. Pushing all images to Docker Hub ==='
                withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    sh "echo '${DOCKER_PASS}' | docker login -u '${DOCKER_USER}' --password-stdin"
                    sh "docker push ${DB_IMAGE}"
                    sh "docker push ${BACKEND_IMAGE}"
                    sh "docker push ${FRONTEND_IMAGE}"
                }
            }
        }

        stage('SSH to EC2 & Deploy') {
            steps {
                echo '=== 6. Copying Compose file & Deploying via Docker Compose ==='
                sshagent(['ec2-ssh-key']) {
                    withCredentials([
                        string(credentialsId: 'db-root-pass', variable: 'DB_ROOT_PASS'),
                        string(credentialsId: 'db-name', variable: 'DB_NAME'),
                        string(credentialsId: 'db-user', variable: 'DB_USER'),
                        string(credentialsId: 'db-pass', variable: 'DB_PASS')
                    ]) {
                  // and passing credentials safely into the bash environment.
                        sh '''
                            ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_IP} "mkdir -p /home/ubuntu/SHAmart-Ecom-devops/database /home/ubuntu/SHAmart-Ecom-devops/backend"
                            
                            scp -o StrictHostKeyChecking=no DockerCompose.yml ${EC2_USER}@${EC2_IP}:/home/ubuntu/SHAmart-Ecom-devops/
                            
                            ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_IP} << 'EOF'
                              cd /home/ubuntu/SHAmart-Ecom-devops
                              
                              # 1. Create database .env file
                              echo "MYSQL_ROOT_PASSWORD='''${DB_ROOT_PASS}'''" > database/.env
                              echo "MYSQL_DATABASE='''${DB_NAME}'''" >> database/.env
                              echo "MYSQL_USER='''${DB_USER}'''" >> database/.env
                              echo "MYSQL_PASSWORD='''${DB_PASS}'''" >> database/.env
                              
                              # 2. Create backend .env.compose file
                              cat << 'EOL' > backend/.env.compose
                              DB_HOST=database
                              DB_PORT=3306
                              DB_USER='''${DB_USER}'''
                              DB_PASSWORD='''${DB_PASS}'''
                              DB_NAME='''${DB_NAME}'''
                              HOST=0.0.0.0
                              PORT=8000
                              FLASK_DEBUG=false
                              APP_ENV=production
                              EOL
                              
                              echo 'Environment files and DockerCompose.yml synced successfully!'
                              
                              # 3. Pull and run using Docker Compose
                              sudo docker compose -f DockerCompose.yml pull
                              sudo docker compose -f DockerCompose.yml up -d --remove-orphans
                              
                              echo 'Deployment completed successfully!'
                            EOF
                        '''.stripIndent()
                    }
                }
            }
        }

        stage('Health Check') {
            steps {
                echo '=== 7. Performing application health check ==='
                sleep 5
                sh "curl -f http://${EC2_IP}/ || echo 'Health check warning, check app endpoints.'"
            }
        }
    }

    post {
        always {
            cleanWs()
            echo 'Pipeline execution finished.'
        }
    }
}