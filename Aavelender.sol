// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// AAVE Pool interface
interface IPool {
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    function getReserveData(
        address asset
    ) external view returns (DataTypes.ReserveData memory);
}

// DataTypes library to interact with AAVE's getReserveData function
library DataTypes {
    struct ReserveConfigurationMap {
        uint256 data;
    }

    struct ReserveData {
        ReserveConfigurationMap configuration;
        uint128 liquidityIndex;
        uint128 currentLiquidityRate;
        uint128 variableBorrowIndex;
        uint128 currentVariableBorrowRate;
        uint128 currentStableBorrowRate;
        uint40 lastUpdateTimestamp;
        uint16 id;
        address aTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        address interestRateStrategyAddress;
        uint128 accruedToTreasury;
        uint128 unbacked;
        uint128 isolationModeTotalDebt;
    }
}

contract AaveLender {
    address public constant AAVE_POOL_ADDRESS = 0x48914C788295b5db23aF2b5F0B3BE775C4eA9440;
    address public constant STAKED_TOKEN_ADDRESS = 0x7984E363c38b590bB4CA35aEd5133Ef2c6619C40;

    IPool public pool = IPool(AAVE_POOL_ADDRESS);

    // Stake (or lend) DAI to Aave Pool on behalf of the user
    function stake(uint256 amount) external {
        // Step 1: Transfer the DAI tokens to this contract
        IERC20(STAKED_TOKEN_ADDRESS).transferFrom(msg.sender, address(this), amount);
        
        // Step 2: Approve the Aave Pool to manage the deposited DAI tokens
        IERC20(STAKED_TOKEN_ADDRESS).approve(AAVE_POOL_ADDRESS, amount);
        
        // Step 3: Call the supply function in the Aave Pool on behalf of the transaction sender
        pool.supply(STAKED_TOKEN_ADDRESS, amount, msg.sender, 0);
    }

    // Unstake (or withdraw) DAI from Aave Pool
    function unstake(uint256 amount) external {
        // Step 1: Retrieve the aToken address (corresponding to DAI)
        address aTokenAddress = pool.getReserveData(STAKED_TOKEN_ADDRESS).aTokenAddress;

        // Step 2: Transfer aDAI from the user to this contract
        IERC20(aTokenAddress).transferFrom(msg.sender, address(this), amount);
        
        // Step 3: Approve the Aave Pool to manage the aDAI tokens
        IERC20(aTokenAddress).approve(AAVE_POOL_ADDRESS, amount);

        // Step 4: Withdraw DAI from the Aave Pool
        pool.withdraw(STAKED_TOKEN_ADDRESS, amount, msg.sender);
    }
}
