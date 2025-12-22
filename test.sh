#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Starting Backend Tests...${NC}"

run_unit_tests() {
    echo -e "\n${BLUE}Running Unit Tests...${NC}"
    npm test
    return $?
}

run_integration_tests() {
    echo -e "\n${BLUE}Running Integration Tests...${NC}"
    npm run test:integration
    return $?
}

if [ "$1" == "unit" ]; then
    run_unit_tests
elif [ "$1" == "integration" ]; then
    run_integration_tests
else
    run_unit_tests
    UNIT_RESULT=$?
    
    run_integration_tests
    INTEG_RESULT=$?
    
    echo -e "\n${BLUE}Test Summary:${NC}"
    if [ $UNIT_RESULT -eq 0 ]; then
        echo -e "${GREEN}Unit Tests: PASSED${NC}"
    else
        echo -e "${RED}Unit Tests: FAILED${NC}"
    fi
    
    if [ $INTEG_RESULT -eq 0 ]; then
        echo -e "${GREEN}Integration Tests: PASSED${NC}"
    else
        echo -e "${RED}Integration Tests: FAILED${NC}"
    fi
    
    if [ $UNIT_RESULT -eq 0 ] && [ $INTEG_RESULT -eq 0 ]; then
        echo -e "\n${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "\n${RED}Some tests failed.${NC}"
        exit 1
    fi
fi
